// electron/ipc-channels.cjs — contratos IPC compartilhados entre main e preload

const ShieldIpcChannel = {
  START_MONITORING: "shield:start-monitoring",
  STOP_MONITORING: "shield:stop-monitoring",
  FULL_SCAN: "shield:full-scan",
  GET_FINDINGS_LOG: "shield:get-findings-log",
  CHECK_CLAMAV_AVAILABILITY: "shield:check-clamav-availability",
  UPDATE_DEFINITIONS: "shield:update-definitions",
  BLOCK_IP: "shield:block-ip",
  QUARANTINE_FINDING: "shield:quarantine-finding",
  LIST_QUARANTINE: "shield:list-quarantine",
  RESTORE_QUARANTINE: "shield:restore-quarantine",
  DELETE_QUARANTINE: "shield:delete-quarantine",
  ANALYZE_FILE: "shield:analyze-file",
  GET_PROCESS_TREE: "shield:get-process-tree",
  GET_DEFENDER_STATUS: "shield:get-defender-status",
  SYNC_DEFENDER_THREATS: "shield:sync-defender-threats",
  DEFENDER_QUICK_SCAN: "shield:defender-quick-scan",
  DEFENDER_UPDATE_SIGNATURES: "shield:defender-update-signatures",
  THREAT_DETECTED: "shield:event:threat-detected",
  SCAN_STARTED: "shield:event:scan-started",
  SCAN_FINISHED: "shield:event:scan-finished",
  SHIELD_ERROR: "shield:event:error",
};

const OptimizerIpcChannel = {
  SCAN_DISK_USAGE: "optimizer:scan-disk-usage",
  SCAN_JUNK: "optimizer:scan-junk",
  MOVE_TO_HOLDING: "optimizer:move-to-holding",
  MOVE_MANY_TO_HOLDING: "optimizer:move-many-to-holding",
  LIST_HOLDING: "optimizer:list-holding",
  RESTORE_FROM_HOLDING: "optimizer:restore-from-holding",
  DELETE_PERMANENTLY: "optimizer:delete-permanently",
  CHECK_UPDATES: "optimizer:check-updates",
  DETECT_PACKAGE_MANAGER: "optimizer:detect-package-manager",
  RUN_UPDATE: "optimizer:run-update",
  RUN_UPDATES_BATCH: "optimizer:run-updates-batch",
};

const AppIpcChannel = {
  PICK_DIRECTORY: "app:pick-directory",
};

module.exports = { ShieldIpcChannel, OptimizerIpcChannel, AppIpcChannel };
