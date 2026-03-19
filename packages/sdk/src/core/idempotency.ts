export function resolveDefaultIdempotencyKey(input: {
  action: "CREATE_ORDER" | "CLOSE_ORDER" | "CREATE_REFUND";
  merchantOrderNo?: string;
  platformOrderNo?: string;
  merchantRefundNo?: string;
}): string | undefined {
  switch (input.action) {
    case "CREATE_ORDER":
      return input.merchantOrderNo
        ? `order:create:${input.merchantOrderNo}`
        : undefined;
    case "CLOSE_ORDER":
      return input.platformOrderNo
        ? `order:close:${input.platformOrderNo}`
        : undefined;
    case "CREATE_REFUND":
      return input.merchantRefundNo
        ? `refund:create:${input.merchantRefundNo}`
        : undefined;
    default:
      return undefined;
  }
}
