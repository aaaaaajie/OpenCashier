import {
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { MerchantStatus, SignType } from "@prisma/client";
import type { RequestWithContext } from "../../common/interfaces/request-with-context.interface";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildCanonicalPath,
  buildMerchantIdempotencyFingerprint,
  buildMerchantRequestSigningContent,
  verifyMerchantRequestSignature
} from "./merchant-request-signing.util";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

@Injectable()
export class MerchantAuthService {
  constructor(private readonly prismaService: PrismaService) {}

  async authenticateRequest(request: RequestWithContext): Promise<void> {
    const appId = this.readRequiredHeader(request, "X-App-Id", "AUTH_INVALID");
    const timestamp = this.readRequiredHeader(
      request,
      "X-Timestamp",
      "AUTH_INVALID"
    );
    const nonce = this.readRequiredHeader(request, "X-Nonce", "AUTH_INVALID");
    const signType = this.readRequiredHeader(
      request,
      "X-Sign-Type",
      "SIGN_INVALID"
    );
    const signature = this.readRequiredHeader(
      request,
      "X-Sign",
      "SIGN_INVALID"
    );
    const merchantApp = await this.prismaService.merchantApp.findUnique({
      where: { appId }
    });

    if (!merchantApp || merchantApp.status !== MerchantStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: "AUTH_INVALID",
        message: "App is unavailable"
      });
    }

    const timestampMs = Number(timestamp);

    if (!Number.isFinite(timestampMs)) {
      throw new UnauthorizedException({
        code: "AUTH_INVALID",
        message: "Invalid timestamp"
      });
    }

    if (Math.abs(Date.now() - timestampMs) > MAX_TIMESTAMP_DRIFT_MS) {
      throw new UnauthorizedException({
        code: "AUTH_INVALID",
        message: "Timestamp expired"
      });
    }

    if (merchantApp.signType !== SignType.HMAC_SHA256 || signType !== "HMAC-SHA256") {
      throw new UnauthorizedException({
        code: "SIGN_INVALID",
        message: "Only HMAC-SHA256 merchant signing is currently enabled"
      });
    }

    if (!merchantApp.secretCiphertext) {
      throw new UnauthorizedException({
        code: "AUTH_INVALID",
        message: "App secret is not configured"
      });
    }

    const canonicalRequest = buildMerchantRequestSigningContent({
      method: request.method,
      originalUrl: request.originalUrl,
      appId,
      timestamp,
      nonce,
      body: request.body
    });

    if (
      !verifyMerchantRequestSignature(
        merchantApp.secretCiphertext,
        canonicalRequest,
        signature.toLowerCase()
      )
    ) {
      throw new UnauthorizedException({
        code: "SIGN_INVALID",
        message: "Invalid merchant signature"
      });
    }

    request.appId = appId;
    request.canonicalPath = buildCanonicalPath(request.originalUrl);
    request.canonicalRequest = canonicalRequest;
    request.idempotencyFingerprint = buildMerchantIdempotencyFingerprint({
      method: request.method,
      originalUrl: request.originalUrl,
      appId,
      body: request.body
    });
    request.timestamp = timestamp;
    request.nonce = nonce;
  }

  private readRequiredHeader(
    request: RequestWithContext,
    headerName: string,
    code: string
  ): string {
    const value = request.header(headerName) ?? request.header(headerName.toLowerCase());

    if (!value) {
      throw new UnauthorizedException({
        code,
        message: `Missing ${headerName} header`
      });
    }

    return value;
  }
}
