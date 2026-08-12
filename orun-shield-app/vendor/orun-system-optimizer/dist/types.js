"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageManagerKindSchema = exports.JunkCategorySchema = void 0;
const zod_1 = require("zod");
exports.JunkCategorySchema = zod_1.z.enum([
    "temp-file",
    "cache",
    "log-file",
    "old-installer",
    "empty-folder",
    "os-junk", // Thumbs.db, .DS_Store, desktop.ini
    "trash-recycle-bin",
    "old-downloads",
]);
// --- Updates ---
exports.PackageManagerKindSchema = zod_1.z.enum(["winget", "brew", "apt"]);
