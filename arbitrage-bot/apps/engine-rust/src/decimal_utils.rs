use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal_macros::dec;

pub fn round_quantity_down(qty: Decimal, precision: u32) -> Decimal {
    let multiplier = Decimal::from(10_u32.pow(precision));
    (qty * multiplier).floor() / multiplier
}

pub fn round_quantity_up(qty: Decimal, precision: u32) -> Decimal {
    let multiplier = Decimal::from(10_u32.pow(precision));
    (qty * multiplier).ceil() / multiplier
}

pub fn round_price(price: Decimal, precision: u32) -> Decimal {
    let multiplier = Decimal::from(10_u32.pow(precision));
    (price * multiplier).round() / multiplier
}

pub fn calculate_fee(notional: Decimal, fee_bps: u32) -> Decimal {
    notional * Decimal::from(fee_bps) / dec!(10000)
}

pub fn apply_fee(notional: Decimal, fee_bps: u32) -> Decimal {
    let fee = calculate_fee(notional, fee_bps);
    notional - fee
}

pub fn calculate_price_impact_bps(best_price: Decimal, worst_price: Decimal, side: &str) -> Decimal {
    match side {
        "BUY" => (worst_price / best_price - dec!(1)) * dec!(10000),
        "SELL" => (best_price / worst_price - dec!(1)) * dec!(10000),
        _ => Decimal::ZERO,
    }
}

pub fn calculate_edge_bps(initial_amount: Decimal, final_amount: Decimal) -> Decimal {
    (final_amount / initial_amount - dec!(1)) * dec!(10000)
}

pub fn bps_to_decimal(bps: u32) -> Decimal {
    Decimal::from(bps) / dec!(10000)
}

pub fn decimal_to_bps(decimal: Decimal) -> u32 {
    (decimal * dec!(10000)).to_u32().unwrap_or(0)
}

pub fn validate_quantity(qty: Decimal, min_qty: Decimal, max_qty: Option<Decimal>) -> bool {
    if qty < min_qty {
        return false;
    }
    
    if let Some(max) = max_qty {
        if qty > max {
            return false;
        }
    }
    
    true
}

pub fn validate_notional(qty: Decimal, price: Decimal, min_notional: Decimal) -> bool {
    let notional = qty * price;
    notional >= min_notional
}

pub fn generate_quantum_sizes(
    base_amount: Decimal,
    max_amount: Decimal,
    min_quantum: Decimal,
    multiplier: u32,
) -> Vec<Decimal> {
    let mut sizes = Vec::new();
    let mut current = base_amount;
    let multiplier_decimal = Decimal::from(multiplier);
    
    while current <= max_amount {
        sizes.push(current);
        current *= multiplier_decimal;
    }
    
    // Add the final size if it doesn't exceed max
    if current >= max_amount && !sizes.contains(&max_amount) {
        sizes.push(max_amount);
    }
    
    sizes
}

pub fn calculate_vwap(
    levels: &[(Decimal, Decimal)], // (price, quantity)
    qty_wanted: Decimal,
    side: &str,
) -> (Decimal, Decimal, Decimal, usize) {
    if levels.is_empty() || qty_wanted <= Decimal::ZERO {
        return (Decimal::ZERO, Decimal::ZERO, Decimal::ZERO, 0);
    }

    let mut sorted_levels = levels.to_vec();
    match side {
        "BUY" => sorted_levels.sort_by(|a, b| a.0.cmp(&b.0)), // ascending price
        "SELL" => sorted_levels.sort_by(|a, b| b.0.cmp(&a.0)), // descending price
        _ => return (Decimal::ZERO, Decimal::ZERO, Decimal::ZERO, 0),
    }

    let mut remaining = qty_wanted;
    let mut total_notional = Decimal::ZERO;
    let mut total_qty = Decimal::ZERO;
    let mut worst_price = Decimal::ZERO;
    let mut levels_used = 0;

    for (price, qty) in sorted_levels {
        if remaining <= Decimal::ZERO {
            break;
        }

        let take = Decimal::min(qty, remaining);
        let notional = take * price;

        total_notional += notional;
        total_qty += take;
        remaining -= take;
        worst_price = price;
        levels_used += 1;

        if remaining <= Decimal::ZERO {
            break;
        }
    }

    let avg_price = if total_qty > Decimal::ZERO {
        total_notional / total_qty
    } else {
        Decimal::ZERO
    };

    (total_qty, avg_price, worst_price, levels_used)
}

pub fn can_fill(
    levels: &[(Decimal, Decimal)],
    qty_wanted: Decimal,
    side: &str,
    best_price: Decimal,
    max_slippage_bps: u32,
) -> (bool, Decimal, Decimal, usize, Decimal) {
    let (filled_qty, avg_price, worst_price, levels_used) = calculate_vwap(levels, qty_wanted, side);
    
    if filled_qty < qty_wanted {
        return (false, filled_qty, avg_price, levels_used, Decimal::ZERO);
    }

    let slippage_bps = calculate_price_impact_bps(best_price, worst_price, side);
    let can_fill = slippage_bps <= Decimal::from(max_slippage_bps);

    (can_fill, filled_qty, avg_price, levels_used, slippage_bps)
}

pub fn estimate_quantity_for_notional(
    levels: &[(Decimal, Decimal)],
    target_notional: Decimal,
    side: &str,
    precision: u32,
    max_iterations: usize,
) -> Decimal {
    if levels.is_empty() {
        return Decimal::ZERO;
    }

    let mut sorted_levels = levels.to_vec();
    match side {
        "BUY" => sorted_levels.sort_by(|a, b| a.0.cmp(&b.0)),
        "SELL" => sorted_levels.sort_by(|a, b| b.0.cmp(&a.0)),
        _ => return Decimal::ZERO,
    }

    let best_price = sorted_levels[0].0;
    let mut qty = target_notional / best_price;

    // Binary search to find the right quantity
    let mut low = Decimal::ZERO;
    let mut high = qty * dec!(2);
    let mut iteration = 0;

    while iteration < max_iterations {
        let mid = (low + high) / dec!(2);
        let (_, _, _, _) = calculate_vwap(&sorted_levels, mid, side);
        let result_notional = mid * best_price; // Simplified

        let diff = (result_notional - target_notional).abs();
        let tolerance = target_notional * dec!(0.001); // 0.1% tolerance

        if diff < tolerance {
            return round_quantity_down(mid, precision);
        }

        if result_notional < target_notional {
            low = mid;
        } else {
            high = mid;
        }

        iteration += 1;
    }

    round_quantity_down(qty, precision)
}

pub fn calculate_total_liquidity(levels: &[(Decimal, Decimal)], max_levels: usize) -> Decimal {
    levels
        .iter()
        .take(max_levels)
        .map(|(_, qty)| qty)
        .sum()
}

pub fn has_sufficient_liquidity(
    levels: &[(Decimal, Decimal)],
    qty_wanted: Decimal,
    max_levels: usize,
    buffer_bps: u32,
) -> bool {
    let total_liquidity = calculate_total_liquidity(levels, max_levels);
    let buffer = Decimal::from(buffer_bps) / dec!(10000);
    let required_liquidity = qty_wanted * (dec!(1) + buffer);
    total_liquidity >= required_liquidity
}
