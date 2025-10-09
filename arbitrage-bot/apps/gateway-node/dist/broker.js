"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Broker = void 0;
const decimal_js_1 = require("decimal.js");
class Broker {
    constructor(config, restClient, clickhouse, logger) {
        this.activeOrders = new Map();
        this.config = config;
        this.restClient = restClient;
        this.clickhouse = clickhouse;
        this.logger = logger;
        this.metrics = {
            ordersPlaced: 0,
            ordersFilled: 0,
            ordersRejected: 0,
            totalVolume: new decimal_js_1.Decimal(0),
            totalFees: new decimal_js_1.Decimal(0),
            pnl: new decimal_js_1.Decimal(0)
        };
    }
    async executeBundle(bundle) {
        try {
            this.logger.info('Executing order bundle:', {
                triangleId: bundle.triangle_id,
                route: bundle.route,
                expectedEdge: bundle.expected_edge,
                capitalInr: bundle.capital_inr,
                legsCount: bundle.legs.length
            });
            const orders = [];
            let currentLegIndex = 0;
            // Store active bundle
            this.activeOrders.set(bundle.risk_token, { bundle, legIndex: currentLegIndex });
            // Execute legs sequentially
            for (let i = 0; i < bundle.legs.length; i++) {
                const leg = bundle.legs[i];
                if (!leg) {
                    this.logger.error('Missing leg in bundle', { triangleId: bundle.triangle_id, legIndex: i });
                    return { success: false, orders: [], error: 'Missing leg in bundle' };
                }
                try {
                    const orderResult = await this.executeLeg(leg, bundle.risk_token);
                    if (!orderResult.success) {
                        // If leg fails, hedge any partial exposure
                        await this.hedgeExposure(bundle, i);
                        return {
                            success: false,
                            orders,
                            error: `Leg ${i + 1} failed: ${orderResult.error}`
                        };
                    }
                    orders.push(orderResult.orderId);
                    // Check fill fraction for legs 1 and 2
                    if (i < 2) {
                        const minFillFraction = i === 0 ? this.config.engine.minFillFractionL1 : this.config.engine.minFillFractionL2;
                        if (orderResult.fillFraction && orderResult.fillFraction < minFillFraction) {
                            this.logger.warn(`Leg ${i + 1} fill fraction ${orderResult.fillFraction} below threshold ${minFillFraction}`);
                            // Hedge partial exposure
                            await this.hedgeExposure(bundle, i);
                            return {
                                success: false,
                                orders,
                                error: `Leg ${i + 1} fill fraction too low: ${orderResult.fillFraction}`
                            };
                        }
                    }
                    currentLegIndex = i + 1;
                    this.activeOrders.set(bundle.risk_token, { bundle, legIndex: currentLegIndex });
                }
                catch (error) {
                    this.logger.error(`Error executing leg ${i + 1}:`, error);
                    // Hedge any exposure
                    await this.hedgeExposure(bundle, i);
                    return {
                        success: false,
                        orders,
                        error: `Leg ${i + 1} execution error: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
            // Remove from active orders
            this.activeOrders.delete(bundle.risk_token);
            this.logger.info('Order bundle executed successfully:', {
                triangleId: bundle.triangle_id,
                ordersPlaced: orders.length
            });
            return { success: true, orders };
        }
        catch (error) {
            this.logger.error('Error executing order bundle:', error);
            return {
                success: false,
                orders: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    async executeLeg(leg, riskToken) {
        try {
            // Calculate order price with aggressive offset
            const aggressiveOffset = this.config.ws.aggressiveEpsBps / 10000;
            let orderPrice;
            if (leg.side === 'BUY') {
                orderPrice = new decimal_js_1.Decimal(leg.vwap_price).mul(1 + aggressiveOffset);
            }
            else {
                orderPrice = new decimal_js_1.Decimal(leg.vwap_price).mul(1 - aggressiveOffset);
            }
            // Round price to market precision
            // TODO: Get precision from market metadata
            const pricePrecision = 2;
            const multiplier = new decimal_js_1.Decimal(10).pow(pricePrecision);
            orderPrice = orderPrice.mul(multiplier).round().div(multiplier);
            const orderRequest = {
                market: leg.market,
                total_quantity: leg.qty.toString(),
                price_per_unit: orderPrice.toString(),
                side: leg.side.toLowerCase(),
                order_type: 'limit_order',
                client_order_id: `${riskToken}_${leg.market}_${Date.now()}`,
                timestamp: Date.now()
            };
            this.logger.debug('Placing order:', {
                market: orderRequest.market,
                side: orderRequest.side,
                total_quantity: orderRequest.total_quantity,
                price_per_unit: orderRequest.price_per_unit,
                order_type: orderRequest.order_type
            });
            const orderResponse = await this.restClient.placeOrder(orderRequest);
            // Update metrics
            this.metrics.ordersPlaced++;
            this.metrics.totalVolume = this.metrics.totalVolume.add(new decimal_js_1.Decimal(orderRequest.total_quantity).mul(new decimal_js_1.Decimal(orderRequest.price_per_unit || 0)));
            // Store order in ClickHouse
            this.clickhouse.insertOrder({
                clientOrderId: orderResponse.client_order_id || orderResponse.id,
                market: orderResponse.market,
                side: orderResponse.side,
                price: orderResponse.price_per_unit,
                qty: orderResponse.total_quantity,
                status: orderResponse.status,
                riskToken
            });
            // For IOC orders, check if immediately filled
            if (this.config.ws.orderTif === 'IOC') {
                // In a real implementation, you'd wait for the fill event
                // For now, assume partial fill based on market conditions
                const fillFraction = this.estimateFillFraction(leg, orderPrice);
                return {
                    success: true,
                    orderId: orderResponse.id,
                    fillFraction
                };
            }
            return {
                success: true,
                orderId: orderResponse.id,
                fillFraction: 1.0 // Assume full fill for non-IOC orders
            };
        }
        catch (error) {
            this.logger.error('Error placing order:', error);
            this.metrics.ordersRejected++;
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    estimateFillFraction(leg, orderPrice) {
        // Simple estimation based on price aggressiveness
        const vwapPrice = new decimal_js_1.Decimal(leg.vwap_price);
        const priceDiff = orderPrice.sub(vwapPrice).abs().div(vwapPrice);
        // More aggressive pricing = higher fill probability
        if (priceDiff.lt(0.001))
            return 0.95; // Within 0.1% of VWAP
        if (priceDiff.lt(0.005))
            return 0.85; // Within 0.5% of VWAP
        if (priceDiff.lt(0.01))
            return 0.70; // Within 1% of VWAP
        return 0.50; // Default estimate
    }
    async hedgeExposure(bundle, failedLegIndex) {
        try {
            this.logger.warn('Hedging exposure due to failed execution:', {
                triangleId: bundle.triangle_id,
                failedLegIndex,
                riskToken: bundle.risk_token
            });
            // Determine what exposure needs to be hedged
            // This is a simplified implementation
            if (failedLegIndex === 0) {
                // No exposure yet
                return;
            }
            // For now, just log the hedging requirement
            // In a real implementation, you'd:
            // 1. Calculate current exposure
            // 2. Place market orders to neutralize
            // 3. Mark fills as toxic
            this.logger.info('Hedging logic would execute here');
        }
        catch (error) {
            this.logger.error('Error hedging exposure:', error);
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    getActiveOrders() {
        return new Map(this.activeOrders);
    }
    async cancelOrder(orderId) {
        try {
            const success = await this.restClient.cancelOrder(orderId);
            if (success) {
                this.logger.info('Order cancelled:', orderId);
            }
            return success;
        }
        catch (error) {
            this.logger.error('Error cancelling order:', error);
            return false;
        }
    }
    async getOrderStatus(orderId) {
        try {
            return await this.restClient.getOrderStatus(orderId);
        }
        catch (error) {
            this.logger.error('Error getting order status:', error);
            return null;
        }
    }
}
exports.Broker = Broker;
//# sourceMappingURL=broker.js.map