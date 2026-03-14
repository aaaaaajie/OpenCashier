import assert from "node:assert/strict";
import test from "node:test";
import { NotifyService } from "../src/modules/notify/notify.service";

function createNotifyService(options: {
  eventLog?: {
    id: string;
    processedResult: Record<string, unknown> | null;
  };
  verifyError?: Error;
  verifiedEvent?: {
    eventId: string;
    platformOrderNo: string;
    channelTradeNo?: string;
    tradeStatus: string;
    paidAmount?: number;
    paidTime?: string;
    rawPayload: Record<string, unknown>;
  };
  attempt?: {
    attemptNo: string;
    channel: string;
  } | null;
  orderStatus?: string;
}) {
  const calls = {
    upserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    verifyPayloads: [] as Array<Record<string, unknown>>,
    markAttemptSuccess: [] as Array<Record<string, unknown>>,
    markAttemptCancelled: [] as Array<Record<string, unknown>>,
    markOrderPaid: [] as Array<Record<string, unknown>>,
    markOrderClosed: [] as Array<Record<string, unknown>>
  };

  const prismaService = {
    channelEventLog: {
      upsert: async (args: Record<string, unknown>) => {
        calls.upserts.push(args);
        return {
          id: options.eventLog?.id ?? "log-1",
          processedResult: options.eventLog?.processedResult ?? null
        };
      },
      update: async (args: Record<string, unknown>) => {
        calls.updates.push(args);
        return args;
      }
    }
  };

  const alipayChannelAdapter = {
    verifyNotify: async (payload: Record<string, unknown>) => {
      calls.verifyPayloads.push(payload);

      if (options.verifyError) {
        throw options.verifyError;
      }

      if (!options.verifiedEvent) {
        throw new Error("verifiedEvent is required for this test case");
      }

      return options.verifiedEvent;
    }
  };

  const paymentAttemptService = {
    findAttemptByChannelTradeNo: async () => options.attempt ?? null,
    findLatestAttemptForOrder: async () => options.attempt ?? null,
    markAttemptSuccess: async (attemptNo: string, input: Record<string, unknown>) => {
      calls.markAttemptSuccess.push({ attemptNo, input });
      return null;
    },
    markAttemptCancelled: async (attemptNo: string, input: Record<string, unknown>) => {
      calls.markAttemptCancelled.push({ attemptNo, input });
      return null;
    }
  };

  const paymentStoreService = {
    markOrderPaidFromChannel: async (input: Record<string, unknown>) => {
      calls.markOrderPaid.push(input);
      return {
        status: options.orderStatus ?? "SUCCESS"
      };
    },
    markOrderClosedFromChannel: async (input: Record<string, unknown>) => {
      calls.markOrderClosed.push(input);
      return {
        status: options.orderStatus ?? "CLOSED"
      };
    }
  };

  const service = new NotifyService(
    prismaService as never,
    alipayChannelAdapter as never,
    paymentStoreService as never,
    paymentAttemptService as never
  );

  return { service, calls };
}

test("skips duplicate alipay notify events that were already processed", async () => {
  const { service, calls } = createNotifyService({
    eventLog: {
      id: "log-1",
      processedResult: {
        status: "PROCESSED"
      }
    }
  });

  const result = await service.handleAlipayNotify({
    notify_id: "notify_001",
    out_trade_no: "P202603140001"
  });

  assert.equal(result, "success");
  assert.equal(calls.verifyPayloads.length, 0);
  assert.equal(calls.updates.length, 0);
});

test("records verify failures in channel event logs before returning failure", async () => {
  const { service, calls } = createNotifyService({
    verifyError: new Error("invalid alipay notify signature")
  });

  await assert.rejects(
    async () =>
      service.handleAlipayNotify({
        notify_id: "notify_002",
        out_trade_no: "P202603140002"
      }),
    /invalid alipay notify signature/
  );

  assert.equal(calls.updates.length, 1);

  const update = calls.updates[0] as {
    data: {
      processedResult: {
        status: string;
        error: string;
      };
    };
  };

  assert.equal(update.data.processedResult.status, "VERIFY_FAILED");
  assert.equal(
    update.data.processedResult.error,
    "invalid alipay notify signature"
  );
});

test("stores business processing results without duplicating webhook raw payload", async () => {
  const paidTime = "2026-03-14T10:00:00.000Z";
  const payload = {
    notify_id: "notify_003",
    out_trade_no: "P202603140003",
    trade_no: "2026031400030001"
  };
  const { service, calls } = createNotifyService({
    verifiedEvent: {
      eventId: "notify_003",
      platformOrderNo: "P202603140003",
      channelTradeNo: "2026031400030001",
      tradeStatus: "SUCCESS",
      paidAmount: 9900,
      paidTime,
      rawPayload: payload
    },
    attempt: {
      attemptNo: "A202603140001",
      channel: "alipay_page"
    },
    orderStatus: "SUCCESS"
  });

  const result = await service.handleAlipayNotify(payload);

  assert.equal(result, "success");
  assert.equal(calls.markAttemptSuccess.length, 1);
  assert.deepEqual(calls.markAttemptSuccess[0], {
    attemptNo: "A202603140001",
    input: {
      channelTradeNo: "2026031400030001",
      successTime: paidTime
    }
  });

  assert.equal(
    "channelPayload" in
      ((calls.markAttemptSuccess[0] as { input: Record<string, unknown> }).input),
    false
  );

  assert.deepEqual(calls.markOrderPaid[0], {
    platformOrderNo: "P202603140003",
    paidAmount: 9900,
    successChannel: "alipay_page",
    paidTime
  });

  const update = calls.updates[0] as {
    data: {
      verifyResult: boolean;
      processedResult: {
        status: string;
        tradeStatus: string;
        orderStatus: string;
        attemptNo: string | null;
      };
    };
  };

  assert.equal(update.data.verifyResult, true);
  assert.equal(update.data.processedResult.status, "PROCESSED");
  assert.equal(update.data.processedResult.tradeStatus, "SUCCESS");
  assert.equal(update.data.processedResult.orderStatus, "SUCCESS");
  assert.equal(update.data.processedResult.attemptNo, "A202603140001");
});
