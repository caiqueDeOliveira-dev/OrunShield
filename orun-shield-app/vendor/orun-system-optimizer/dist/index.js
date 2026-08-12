"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemOptimizer = exports.UpdateExecutor = exports.UpdateChecker = exports.CleanupManager = exports.isKnownOsJunkFileName = exports.JunkFileDetector = exports.DiskUsageScanner = void 0;
__exportStar(require("./types.js"), exports);
var DiskUsageScanner_js_1 = require("./disk/DiskUsageScanner.js");
Object.defineProperty(exports, "DiskUsageScanner", { enumerable: true, get: function () { return DiskUsageScanner_js_1.DiskUsageScanner; } });
var JunkFileDetector_js_1 = require("./disk/JunkFileDetector.js");
Object.defineProperty(exports, "JunkFileDetector", { enumerable: true, get: function () { return JunkFileDetector_js_1.JunkFileDetector; } });
Object.defineProperty(exports, "isKnownOsJunkFileName", { enumerable: true, get: function () { return JunkFileDetector_js_1.isKnownOsJunkFileName; } });
var CleanupManager_js_1 = require("./cleanup/CleanupManager.js");
Object.defineProperty(exports, "CleanupManager", { enumerable: true, get: function () { return CleanupManager_js_1.CleanupManager; } });
var UpdateChecker_js_1 = require("./updates/UpdateChecker.js");
Object.defineProperty(exports, "UpdateChecker", { enumerable: true, get: function () { return UpdateChecker_js_1.UpdateChecker; } });
var UpdateExecutor_js_1 = require("./updates/UpdateExecutor.js");
Object.defineProperty(exports, "UpdateExecutor", { enumerable: true, get: function () { return UpdateExecutor_js_1.UpdateExecutor; } });
var SystemOptimizer_js_1 = require("./orchestrator/SystemOptimizer.js");
Object.defineProperty(exports, "SystemOptimizer", { enumerable: true, get: function () { return SystemOptimizer_js_1.SystemOptimizer; } });
