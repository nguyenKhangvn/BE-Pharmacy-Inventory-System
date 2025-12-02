import cron from "node-cron";
import inventoryScanner from "../services/inventoryScanner.service.js";

/**
 * Cron jobs cho hệ thống
 */
class CronJobs {
  constructor() {
    this.jobs = [];
  }

  /**
   * Khởi tạo tất cả các cron jobs
   */
  initialize() {
    console.log("[CronJobs] Initializing scheduled tasks...");

    // Job 1: Quét kho hàng đêm lúc 2:00 AM
    this.scheduleInventoryScan();

    // Job 2: Auto-resolve alerts mỗi 6 giờ
    this.scheduleAutoResolveAlerts();

    console.log(`[CronJobs] ${this.jobs.length} jobs scheduled successfully`);
  }

  /**
   * Job quét kho hàng đêm
   * Chạy lúc 2:00 AM mỗi ngày
   * Cron format: "0 2 * * *" = phút 0, giờ 2, mỗi ngày
   */
  scheduleInventoryScan() {
    const job = cron.schedule(
      "0 2 * * *",
      async () => {
        console.log(
          `[CronJob-InventoryScan] Starting scheduled scan at ${new Date().toISOString()}`
        );
        try {
          const results = await inventoryScanner.scanInventory();
          console.log(
            `[CronJob-InventoryScan] Completed successfully:`,
            results
          );
        } catch (error) {
          console.error(
            `[CronJob-InventoryScan] Error during scheduled scan:`,
            error
          );
        }
      },
      {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh", // Múi giờ Việt Nam
      }
    );

    this.jobs.push({
      name: "Inventory Scan",
      schedule: "0 2 * * *",
      description: "Scan inventory for low stock and expiry alerts",
      job,
    });

    console.log(
      "[CronJobs] Inventory scan scheduled at 2:00 AM daily (Asia/Ho_Chi_Minh timezone)"
    );
  }

  /**
   * Job tự động giải quyết các alerts đã không còn vấn đề
   * Chạy mỗi 6 giờ
   * Cron format: "0 */ 6; /* * *" = phút 0, mỗi 6 giờ
   */
  scheduleAutoResolveAlerts() {
    const job = cron.schedule(
      "0 */6 * * *",
      async () => {
        console.log(
          `[CronJob-AutoResolve] Starting auto-resolve at ${new Date().toISOString()}`
        );
        try {
          await inventoryScanner.autoResolveAlerts();
          console.log(`[CronJob-AutoResolve] Completed successfully`);
        } catch (error) {
          console.error(
            `[CronJob-AutoResolve] Error during auto-resolve:`,
            error
          );
        }
      },
      {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh",
      }
    );

    this.jobs.push({
      name: "Auto Resolve Alerts",
      schedule: "0 */6 * * *",
      description: "Auto resolve outdated alerts every 6 hours",
      job,
    });

    console.log(
      "[CronJobs] Auto-resolve alerts scheduled every 6 hours (Asia/Ho_Chi_Minh timezone)"
    );
  }

  /**
   * Lấy danh sách các jobs đang chạy
   */
  getJobs() {
    return this.jobs.map((j) => ({
      name: j.name,
      schedule: j.schedule,
      description: j.description,
    }));
  }

  /**
   * Dừng tất cả các cron jobs
   */
  stopAll() {
    console.log("[CronJobs] Stopping all scheduled tasks...");
    this.jobs.forEach((j) => {
      j.job.stop();
    });
    console.log(`[CronJobs] ${this.jobs.length} jobs stopped`);
  }

  /**
   * Trigger manual scan (cho testing hoặc chạy thủ công)
   */
  async runManualScan() {
    console.log(
      `[CronJobs] Manual scan triggered at ${new Date().toISOString()}`
    );
    try {
      const results = await inventoryScanner.scanInventory();
      console.log(`[CronJobs] Manual scan completed:`, results);
      return results;
    } catch (error) {
      console.error(`[CronJobs] Error during manual scan:`, error);
      throw error;
    }
  }
}

export default new CronJobs();
