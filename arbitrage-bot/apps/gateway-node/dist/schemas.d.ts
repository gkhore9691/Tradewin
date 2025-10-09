export interface TopOfBook {
    market: string;
    bestBid: number;
    bestBidQty: number;
    bestAsk: number;
    bestAskQty: number;
    depthBid: DepthLevel[];
    depthAsk: DepthLevel[];
    tsExchangeNs: number;
    tsGatewayNs: number;
}
export interface DepthLevel {
    px: number;
    qty: number;
}
export interface OrderBundle {
    triangle_id: string;
    route: string;
    legs: Leg[];
    expected_edge: number;
    capital_inr: number;
    risk_token: string;
    ts_engine_ns: number;
}
export interface Leg {
    market: string;
    side: string;
    price: number;
    qty: number;
    time_in_force: string;
    intent: string;
    vwap_price: number;
    worst_price: number;
    impact_bps: number;
    levels_used: number;
}
export interface Execution {
    clientOrderId: string;
    market: string;
    side: string;
    price: number;
    qty: number;
    fee: number;
    feeAsset: string;
    status: string;
    riskToken: string;
    tsAckNs: number;
    toxicFill: boolean;
}
export interface Balance {
    asset: string;
    available: number;
    locked: number;
    tsNs: number;
}
//# sourceMappingURL=schemas.d.ts.map