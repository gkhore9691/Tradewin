"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const winston_1 = __importDefault(require("winston"));
// Safe JSON stringify that handles circular references
function safeStringify(obj, space) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            seen.add(value);
        }
        return value;
    }, space);
}
function createLogger(service) {
    return winston_1.default.createLogger({
        level: process.env['LOG_LEVEL'] || 'info',
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, service: logService, ...meta }) => {
            const logEntry = {
                timestamp,
                level,
                service: logService || service,
                message,
                ...meta
            };
            return safeStringify(logEntry);
        })),
        defaultMeta: { service },
        transports: [
            new winston_1.default.transports.Console({
                format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
            })
        ]
    });
}
//# sourceMappingURL=logger.js.map