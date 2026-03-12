import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Prisma, type IdempotencyRecord } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { sha256Hex } from "./merchant-request-signing.util";

const DEFAULT_REQUEST_TTL_SECONDS = 24 * 60 * 60;
const NONCE_TTL_SECONDS = 10 * 60;

@Injectable()
export class IdempotencyService {
  constructor(private readonly prismaService: PrismaService) {}

  requireIdempotencyKey(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new BadRequestException({
        code: "PARAM_INVALID",
        message: "Missing Idempotency-Key header"
      });
    }

    return headerValue.trim();
  }

  async registerNonce(input: {
    appId: string;
    nonce: string;
    requestFingerprint: string;
  }): Promise<void> {
    const existing = await this.findExistingRecord({
      appId: input.appId,
      action: "AUTH_NONCE",
      idempotencyKey: input.nonce
    });

    if (existing) {
      throw new UnauthorizedException({
        code: "NONCE_REPLAY",
        message: "Nonce replay detected"
      });
    }

    try {
      await this.prismaService.idempotencyRecord.create({
        data: {
          appId: input.appId,
          action: "AUTH_NONCE",
          idempotencyKey: input.nonce,
          requestHash: sha256Hex(input.requestFingerprint),
          expireTime: new Date(Date.now() + NONCE_TTL_SECONDS * 1000)
        }
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      throw new UnauthorizedException({
        code: "NONCE_REPLAY",
        message: "Nonce replay detected"
      });
    }
  }

  async execute<T>(input: {
    appId: string;
    action: string;
    idempotencyKey: string;
    requestFingerprint: string;
    expireInSeconds?: number;
    resolveResourceNo?: (result: T) => string | undefined;
    execute: () => Promise<T>;
  }): Promise<T> {
    const requestHash = sha256Hex(input.requestFingerprint);
    const expireTime = new Date(
      Date.now() + (input.expireInSeconds ?? DEFAULT_REQUEST_TTL_SECONDS) * 1000
    );
    const existing = await this.findExistingRecord({
      appId: input.appId,
      action: input.action,
      idempotencyKey: input.idempotencyKey
    });

    if (existing) {
      return this.replayExistingRecord(existing, requestHash) as T;
    }

    let createdRecord: IdempotencyRecord | null = null;

    try {
      createdRecord = await this.prismaService.idempotencyRecord.create({
        data: {
          appId: input.appId,
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          expireTime
        }
      });

      const result = await input.execute();

      await this.prismaService.idempotencyRecord.update({
        where: { id: createdRecord.id },
        data: {
          resourceNo: input.resolveResourceNo?.(result),
          responseSnapshot: result as Prisma.InputJsonValue
        }
      });

      return result;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const conflicted = await this.findExistingRecord({
          appId: input.appId,
          action: input.action,
          idempotencyKey: input.idempotencyKey
        });

        if (conflicted) {
          return this.replayExistingRecord(conflicted, requestHash) as T;
        }
      }

      if (createdRecord) {
        await this.prismaService.idempotencyRecord.delete({
          where: { id: createdRecord.id }
        }).catch(() => undefined);
      }

      throw error;
    }
  }

  private async findExistingRecord(input: {
    appId: string;
    action: string;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | null> {
    const existing = await this.prismaService.idempotencyRecord.findUnique({
      where: {
        appId_action_idempotencyKey: {
          appId: input.appId,
          action: input.action,
          idempotencyKey: input.idempotencyKey
        }
      }
    });

    if (!existing) {
      return null;
    }

    if (existing.expireTime <= new Date()) {
      await this.prismaService.idempotencyRecord.delete({
        where: { id: existing.id }
      }).catch(() => undefined);

      return null;
    }

    return existing;
  }

  private replayExistingRecord(
    existing: IdempotencyRecord,
    requestHash: string
  ): Prisma.JsonValue {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: "IDEMPOTENT_CONFLICT",
        message: "Idempotency key already exists with different parameters"
      });
    }

    if (existing.responseSnapshot === null) {
      throw new ConflictException({
        code: "IDEMPOTENT_CONFLICT",
        message: "Request with same Idempotency-Key is still processing"
      });
    }

    return existing.responseSnapshot;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
