import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  NotifyTaskStatus,
  Prisma,
  SignType,
  type MerchantApp
} from "@prisma/client";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID
} from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

const NOTIFY_BATCH_SIZE = 10;
const NOTIFY_REQUEST_TIMEOUT_MS = 5000;
const NOTIFY_CLAIM_LEASE_MS = 2 * 60 * 1000;
const NOTIFY_RETRY_BACKOFF_MINUTES = [1, 5, 15, 30, 60, 360];
const NOTIFY_RESPONSE_MAX_LENGTH = 1000;

interface ClaimedNotifyTask {
  id: string;
  notifyId: string;
  businessType: string;
  businessNo: string;
  merchantId: string;
  notifyUrl: string;
  payload: Prisma.JsonValue;
  status: NotifyTaskStatus;
  retryCount: number;
  nextRetryTime: Date | null;
  lastHttpCode: number | null;
  lastResponse: string | null;
  traceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NotifyTaskView {
  notifyId: string;
  businessType: string;
  businessNo: string;
  eventType: string;
  appId: string | null;
  notifyUrl: string;
  status: string;
  retryCount: number;
  nextRetryTime: string | null;
  lastHttpCode: number | null;
  lastResponse: string | null;
  updatedAt: string;
  createdAt: string;
}

@Injectable()
export class MerchantNotifyDispatcherService {
  private readonly logger = new Logger(MerchantNotifyDispatcherService.name);
  private isDispatching = false;

  constructor(private readonly prismaService: PrismaService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchDueTasks(): Promise<void> {
    if (this.isDispatching) {
      return;
    }

    this.isDispatching = true;

    try {
      const tasks = await this.claimDueTasks();

      if (!tasks.length) {
        return;
      }

      await Promise.allSettled(tasks.map((task) => this.dispatchTask(task)));
    } finally {
      this.isDispatching = false;
    }
  }

  async listTasks(): Promise<NotifyTaskView[]> {
    const tasks = await this.prismaService.notifyTask.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });

    return tasks.map((task) => this.toNotifyTaskView(task));
  }

  async replayTask(notifyId: string): Promise<NotifyTaskView> {
    const existingTask = await this.prismaService.notifyTask.findUnique({
      where: { notifyId }
    });

    if (!existingTask) {
      throw new NotFoundException("Notify task not found");
    }

    const task = await this.prismaService.notifyTask.update({
      where: { notifyId },
      data: {
        status: NotifyTaskStatus.PENDING,
        retryCount: 0,
        nextRetryTime: null,
        lastHttpCode: null,
        lastResponse: null,
        traceId: null
      }
    });

    return this.toNotifyTaskView(task);
  }

  private async claimDueTasks(): Promise<ClaimedNotifyTask[]> {
    const traceId = `notify_${randomUUID()}`;
    const leaseUntil = new Date(Date.now() + NOTIFY_CLAIM_LEASE_MS);

    return this.prismaService.$queryRaw<ClaimedNotifyTask[]>(Prisma.sql`
      WITH picked AS (
        SELECT id
        FROM notify_task
        WHERE status IN ('PENDING', 'RETRYING')
          AND (next_retry_time IS NULL OR next_retry_time <= NOW())
        ORDER BY COALESCE(next_retry_time, created_at) ASC, created_at ASC
        LIMIT ${NOTIFY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notify_task AS task
      SET status = CAST('RETRYING' AS "NotifyTaskStatus"),
          trace_id = ${traceId},
          next_retry_time = ${leaseUntil},
          updated_at = NOW()
      FROM picked
      WHERE task.id = picked.id
      RETURNING
        task.id,
        task.notify_id AS "notifyId",
        task.business_type AS "businessType",
        task.business_no AS "businessNo",
        task.merchant_id AS "merchantId",
        task.notify_url AS "notifyUrl",
        task.payload,
        task.status,
        task.retry_count AS "retryCount",
        task.next_retry_time AS "nextRetryTime",
        task.last_http_code AS "lastHttpCode",
        task.last_response AS "lastResponse",
        task.trace_id AS "traceId",
        task.created_at AS "createdAt",
        task.updated_at AS "updatedAt"
    `);
  }

  private async dispatchTask(task: ClaimedNotifyTask): Promise<void> {
    const payload = this.normalizePayload(task);
    const body = JSON.stringify(payload);
    const merchantApp = await this.loadMerchantApp(payload.appId);

    try {
      const response = await fetch(task.notifyUrl, {
        method: "POST",
        headers: this.buildHeaders(task, body, payload.appId, merchantApp),
        body,
        signal: AbortSignal.timeout(NOTIFY_REQUEST_TIMEOUT_MS)
      });
      const responseText = this.truncateResponse(await response.text());

      if (this.isNotifyAccepted(response.status, responseText)) {
        await this.markTaskSuccess(task, response.status, responseText);
        return;
      }

      await this.scheduleRetry(task, response.status, responseText);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "notify delivery failed";

      this.logger.warn(
        `Notify task ${task.notifyId} failed to deliver: ${message}`
      );

      await this.scheduleRetry(task, null, message);
    }
  }

  private async loadMerchantApp(appId: string | undefined): Promise<MerchantApp | null> {
    if (!appId) {
      return null;
    }

    return this.prismaService.merchantApp.findUnique({
      where: { appId }
    });
  }

  private buildHeaders(
    task: ClaimedNotifyTask,
    body: string,
    appId: string | undefined,
    merchantApp: MerchantApp | null
  ): Record<string, string> {
    const timestamp = Date.now().toString();
    const nonce = randomBytes(8).toString("hex");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-notify-id": task.notifyId,
      "x-timestamp": timestamp,
      "x-nonce": nonce
    };

    if (appId) {
      headers["x-app-id"] = appId;
    }

    if (
      merchantApp?.signType === SignType.HMAC_SHA256 &&
      merchantApp.secretCiphertext
    ) {
      headers["x-sign-type"] = "HMAC-SHA256";
      headers["x-sign"] = this.signWithHmac(
        merchantApp.secretCiphertext,
        task.notifyId,
        timestamp,
        nonce,
        body
      );
    }

    return headers;
  }

  private signWithHmac(
    secret: string,
    notifyId: string,
    timestamp: string,
    nonce: string,
    body: string
  ): string {
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const content = [notifyId, timestamp, nonce, bodyHash].join("\n");

    return createHmac("sha256", secret).update(content).digest("hex");
  }

  private isNotifyAccepted(status: number, responseText: string): boolean {
    return status >= 200 && status < 300 && responseText.trim().toLowerCase() === "success";
  }

  private async markTaskSuccess(
    task: ClaimedNotifyTask,
    httpCode: number,
    responseText: string
  ): Promise<void> {
    await this.prismaService.notifyTask.updateMany({
      where: {
        notifyId: task.notifyId,
        traceId: task.traceId
      },
      data: {
        status: NotifyTaskStatus.SUCCESS,
        nextRetryTime: null,
        lastHttpCode: httpCode,
        lastResponse: responseText,
        traceId: null
      }
    });
  }

  private async scheduleRetry(
    task: ClaimedNotifyTask,
    httpCode: number | null,
    responseText: string
  ): Promise<void> {
    const nextRetryCount = task.retryCount + 1;
    const backoffMinutes = NOTIFY_RETRY_BACKOFF_MINUTES[nextRetryCount - 1];
    const shouldDeadLetter = backoffMinutes === undefined;

    await this.prismaService.notifyTask.updateMany({
      where: {
        notifyId: task.notifyId,
        traceId: task.traceId
      },
      data: {
        status: shouldDeadLetter
          ? NotifyTaskStatus.DEAD
          : NotifyTaskStatus.RETRYING,
        retryCount: nextRetryCount,
        nextRetryTime: shouldDeadLetter
          ? null
          : new Date(Date.now() + backoffMinutes * 60 * 1000),
        lastHttpCode: httpCode,
        lastResponse: this.truncateResponse(responseText),
        traceId: null
      }
    });
  }

  private normalizePayload(task: ClaimedNotifyTask): Record<string, unknown> & {
    appId?: string;
  } {
    const payload =
      task.payload && typeof task.payload === "object" && !Array.isArray(task.payload)
        ? { ...(task.payload as Record<string, unknown>) }
        : {};

    const eventType =
      this.readString(payload.eventType) ??
      this.readString(payload.event) ??
      `${task.businessType}_EVENT`;

    return {
      notifyId: task.notifyId,
      businessType: task.businessType,
      businessNo: task.businessNo,
      eventType,
      ...payload,
      appId: this.readString(payload.appId)
    };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private truncateResponse(value: string): string {
    return value.slice(0, NOTIFY_RESPONSE_MAX_LENGTH);
  }

  private toNotifyTaskView(task: {
    notifyId: string;
    businessType: string;
    businessNo: string;
    notifyUrl: string;
    status: NotifyTaskStatus;
    retryCount: number;
    nextRetryTime: Date | null;
    lastHttpCode: number | null;
    lastResponse: string | null;
    payload: Prisma.JsonValue;
    updatedAt: Date;
    createdAt: Date;
  }): NotifyTaskView {
    const payload =
      task.payload && typeof task.payload === "object" && !Array.isArray(task.payload)
        ? (task.payload as Record<string, unknown>)
        : {};

    return {
      notifyId: task.notifyId,
      businessType: task.businessType,
      businessNo: task.businessNo,
      eventType:
        this.readString(payload.eventType) ??
        this.readString(payload.event) ??
        "-",
      appId: this.readString(payload.appId) ?? null,
      notifyUrl: task.notifyUrl,
      status: task.status,
      retryCount: task.retryCount,
      nextRetryTime: task.nextRetryTime?.toISOString() ?? null,
      lastHttpCode: task.lastHttpCode,
      lastResponse: task.lastResponse,
      updatedAt: task.updatedAt.toISOString(),
      createdAt: task.createdAt.toISOString()
    };
  }
}
