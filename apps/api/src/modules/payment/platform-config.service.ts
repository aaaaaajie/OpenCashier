import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  getPlatformConfigFieldDefinition,
  getPlatformConfigGroupDefinition,
  getPlatformConfigGroupKeyByFieldKey,
  isPlatformConfigGroupKey,
  type PlatformConfigGroupDefinition,
  type PlatformConfigGroupKey,
  type PlatformConfigKey
} from "./platform-config.constants";

type PlatformConfigGroupValue = Record<string, string>;
type AdminPlatformConfigValue = Record<string, string | null>;
type PlatformConfigStage = "ACTIVE" | "DRAFT";

interface CachedPlatformConfigGroup {
  id: string;
  key: PlatformConfigGroupKey;
  value: PlatformConfigGroupValue;
  createdAt: Date;
  updatedAt: Date;
}

interface UpsertPlatformConfigInput {
  key: string;
  value: Record<string, unknown>;
}

interface AdminPlatformConfigStageRecord {
  id: string;
  value: AdminPlatformConfigValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPlatformConfigRecord {
  key: string;
  active?: AdminPlatformConfigStageRecord;
  draft?: AdminPlatformConfigStageRecord;
}

@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  private readonly activeConfigCache = new Map<
    PlatformConfigGroupKey,
    CachedPlatformConfigGroup
  >();
  private readonly draftConfigCache = new Map<
    PlatformConfigGroupKey,
    CachedPlatformConfigGroup
  >();
  private readonly previewContext = new AsyncLocalStorage<
    Map<PlatformConfigGroupKey, PlatformConfigGroupValue>
  >();

  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reloadCache();
  }

  get(key: PlatformConfigKey): string | undefined {
    const groupKey = getPlatformConfigGroupKeyByFieldKey(key);

    if (!groupKey) {
      return undefined;
    }

    const previewGroup = this.previewContext.getStore()?.get(groupKey);

    if (previewGroup) {
      return previewGroup[key];
    }

    const cached = this.activeConfigCache.get(groupKey);
    const rawValue = cached?.value[key];

    if (!rawValue) {
      return undefined;
    }

    const definition = getPlatformConfigFieldDefinition(key);

    if (!definition) {
      return undefined;
    }

    return definition.secret ? this.decryptSecretValue(rawValue, key) : rawValue;
  }

  listConfigs(): AdminPlatformConfigRecord[] {
    const keys = new Set<PlatformConfigGroupKey>([
      ...this.activeConfigCache.keys(),
      ...this.draftConfigCache.keys()
    ]);

    return Array.from(keys)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => {
        const active = this.activeConfigCache.get(key);
        const draft = this.draftConfigCache.get(key);

        return {
          key,
          active: active
            ? {
                id: active.id,
                value: this.toAdminValue(key, active.value),
                createdAt: active.createdAt,
                updatedAt: active.updatedAt
              }
            : undefined,
          draft: draft
            ? {
                id: draft.id,
                value: this.toAdminValue(key, draft.value),
                createdAt: draft.createdAt,
                updatedAt: draft.updatedAt
              }
            : undefined
        };
      });
  }

  async upsertConfig(
    input: UpsertPlatformConfigInput
  ): Promise<AdminPlatformConfigRecord[]> {
    if (!isPlatformConfigGroupKey(input.key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${input.key}`
      );
    }

    const groupDefinition = getPlatformConfigGroupDefinition(input.key);

    if (!groupDefinition) {
      throw new BadRequestException(
        `unsupported platform config group key: ${input.key}`
      );
    }

    const nextValue = this.buildPreviewGroupValue(input.key, input.value);
    const storageKey = this.toStorageKey(input.key, "DRAFT");

    try {
      if (Object.keys(nextValue).length === 0) {
        await this.prismaService.platformConfig.deleteMany({
          where: { key: storageKey }
        });
      } else {
        const persistedValue = this.toPersistedValue(groupDefinition, nextValue);

        await this.prismaService.platformConfig.upsert({
          where: { key: storageKey },
          update: {
            value: persistedValue
          },
          create: {
            key: storageKey,
            value: persistedValue
          }
        });
      }
    } catch (error) {
      this.rethrowIfStorageMissing(error);
      throw error;
    }

    await this.reloadCache();
    return this.listConfigs();
  }

  async clearConfig(key: string): Promise<AdminPlatformConfigRecord[]> {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    try {
      await this.prismaService.platformConfig.deleteMany({
        where: {
          key: {
            in: [this.toStorageKey(key, "ACTIVE"), this.toStorageKey(key, "DRAFT")]
          }
        }
      });
    } catch (error) {
      this.rethrowIfStorageMissing(error);
      throw error;
    }

    await this.reloadCache();
    return this.listConfigs();
  }

  async activateConfig(key: string): Promise<AdminPlatformConfigRecord[]> {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    const draft = this.draftConfigCache.get(key);

    if (!draft) {
      throw new BadRequestException(`${key} has no draft config to activate`);
    }

    try {
      await this.prismaService.platformConfig.upsert({
        where: { key },
        update: {
          value: draft.value as Prisma.InputJsonObject
        },
        create: {
          key,
          value: draft.value as Prisma.InputJsonObject
        }
      });

      await this.prismaService.platformConfig.deleteMany({
        where: { key: this.toStorageKey(key, "DRAFT") }
      });
    } catch (error) {
      this.rethrowIfStorageMissing(error);
      throw error;
    }

    await this.reloadCache();
    return this.listConfigs();
  }

  async runWithPreview<T>(
    key: string,
    patchValue: Record<string, unknown>,
    callback: () => Promise<T>
  ): Promise<T> {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    const previewValue = this.buildPreviewGroupValue(key, patchValue);
    const currentStore = this.previewContext.getStore();
    const nextStore = new Map(currentStore ?? []);

    nextStore.set(key, previewValue);

    return this.previewContext.run(nextStore, callback);
  }

  private async reloadCache(): Promise<void> {
    try {
      const records = await this.prismaService.platformConfig.findMany();
      this.activeConfigCache.clear();
      this.draftConfigCache.clear();

      records.forEach((record) => {
        const parsedKey = this.parseStorageKey(record.key);

        if (!parsedKey) {
          return;
        }

        const targetCache =
          parsedKey.stage === "DRAFT"
            ? this.draftConfigCache
            : this.activeConfigCache;

        targetCache.set(parsedKey.key, {
          id: record.id,
          key: parsedKey.key,
          value: this.normalizeStoredGroupValue(parsedKey.key, record.value),
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        });
      });
    } catch (error) {
      if (!this.isStorageMissingError(error)) {
        throw error;
      }

      this.activeConfigCache.clear();
      this.draftConfigCache.clear();
      this.logger.warn(
        "platform_config table is not ready yet, platform config reads will return empty values"
      );
    }
  }

  private buildPreviewGroupValue(
    key: string,
    patchValue: Record<string, unknown>
  ): PlatformConfigGroupValue {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    const groupDefinition = getPlatformConfigGroupDefinition(key);

    if (!groupDefinition) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    return this.mergeGroupValue(
      groupDefinition,
      this.getEditableGroupValue(key),
      patchValue
    );
  }

  private mergeGroupValue(
    groupDefinition: PlatformConfigGroupDefinition,
    currentValue: PlatformConfigGroupValue,
    patchValue: Record<string, unknown>
  ): PlatformConfigGroupValue {
    const allowedKeys = new Set(groupDefinition.items.map((item) => item.key));
    const nextValue = { ...currentValue };

    Object.entries(patchValue).forEach(([fieldKey, rawValue]) => {
      if (!allowedKeys.has(fieldKey)) {
        throw new BadRequestException(
          `${fieldKey} does not belong to platform config group ${groupDefinition.key}`
        );
      }

      if (rawValue === null) {
        delete nextValue[fieldKey];
        return;
      }

      if (typeof rawValue !== "string") {
        throw new BadRequestException(`${fieldKey} must be a string or null`);
      }

      const normalizedValue = this.normalizeValue(rawValue);

      if (!normalizedValue) {
        delete nextValue[fieldKey];
        return;
      }

      nextValue[fieldKey] = normalizedValue;
    });

    return nextValue;
  }

  private getEditableGroupValue(
    groupKey: PlatformConfigGroupKey
  ): PlatformConfigGroupValue {
    const groupDefinition = getPlatformConfigGroupDefinition(groupKey);
    const cached =
      this.draftConfigCache.get(groupKey) ?? this.activeConfigCache.get(groupKey);

    if (!groupDefinition || !cached) {
      return {};
    }

    return groupDefinition.items.reduce<PlatformConfigGroupValue>((result, item) => {
      const rawValue = cached.value[item.key];

      if (!rawValue) {
        return result;
      }

      result[item.key] = item.secret
        ? this.decryptSecretValue(rawValue, item.key)
        : rawValue;

      return result;
    }, {});
  }

  private toStorageKey(
    key: PlatformConfigGroupKey,
    stage: PlatformConfigStage
  ): string {
    return stage === "ACTIVE" ? key : `${key}__draft`;
  }

  private parseStorageKey(
    key: string
  ): { key: PlatformConfigGroupKey; stage: PlatformConfigStage } | undefined {
    if (isPlatformConfigGroupKey(key)) {
      return {
        key,
        stage: "ACTIVE"
      };
    }

    const draftKey = key.replace(/__draft$/, "");

    if (!isPlatformConfigGroupKey(draftKey) || draftKey === key) {
      return undefined;
    }

    return {
      key: draftKey,
      stage: "DRAFT"
    };
  }

  private normalizeStoredGroupValue(
    groupKey: PlatformConfigGroupKey,
    value: Prisma.JsonValue
  ): PlatformConfigGroupValue {
    const groupDefinition = getPlatformConfigGroupDefinition(groupKey);

    if (!groupDefinition || !this.isJsonObject(value)) {
      return {};
    }

    return groupDefinition.items.reduce<PlatformConfigGroupValue>((result, item) => {
      const rawValue = value[item.key];

      if (typeof rawValue !== "string") {
        return result;
      }

      const normalizedValue = this.normalizeValue(rawValue);

      if (!normalizedValue) {
        return result;
      }

      result[item.key] = normalizedValue;
      return result;
    }, {});
  }

  private toPersistedValue(
    groupDefinition: PlatformConfigGroupDefinition,
    value: PlatformConfigGroupValue
  ): Prisma.InputJsonObject {
    const result: Record<string, Prisma.InputJsonValue> = {};

    groupDefinition.items.forEach((item) => {
      const rawValue = value[item.key];

      if (!rawValue) {
        return;
      }

      result[item.key] = item.secret
        ? this.encryptSecretValue(rawValue, item.key)
        : rawValue;
    });

    return result as Prisma.InputJsonObject;
  }

  private toAdminValue(
    groupKey: PlatformConfigGroupKey,
    value: PlatformConfigGroupValue
  ): AdminPlatformConfigValue {
    const groupDefinition = getPlatformConfigGroupDefinition(groupKey);

    if (!groupDefinition) {
      return {};
    }

    return groupDefinition.items.reduce<AdminPlatformConfigValue>((result, item) => {
      const rawValue = value[item.key];

      if (!rawValue) {
        return result;
      }

      result[item.key] = item.secret ? null : rawValue;
      return result;
    }, {});
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private encryptSecretValue(value: string, key: string): string {
    const masterKey = this.getMasterKey();

    if (!masterKey) {
      return value;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return [
      "enc",
      "v1",
      iv.toString("base64url"),
      authTag.toString("base64url"),
      encrypted.toString("base64url")
    ].join(":");
  }

  private decryptSecretValue(value: string, key: string): string {
    if (!value.startsWith("enc:v1:")) {
      return value;
    }

    const [, , ivPart, authTagPart, encryptedPart] = value.split(":");

    if (!ivPart || !authTagPart || !encryptedPart) {
      throw new BadRequestException(`stored secret for ${key} has invalid format`);
    }

    const masterKey = this.getMasterKey();

    if (!masterKey) {
      throw new BadRequestException(
        `PLATFORM_CONFIG_MASTER_KEY is required to decrypt stored secret: ${key}`
      );
    }

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        masterKey,
        Buffer.from(ivPart, "base64url")
      );
      decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, "base64url")),
        decipher.final()
      ]).toString("utf8");
    } catch {
      throw new BadRequestException(`failed to decrypt stored secret for ${key}`);
    }
  }

  private getMasterKey(): Buffer | undefined {
    const masterKey = this.normalizeValue(process.env.PLATFORM_CONFIG_MASTER_KEY);
    return masterKey ? createHash("sha256").update(masterKey).digest() : undefined;
  }

  private normalizeValue(value: string | undefined | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private rethrowIfStorageMissing(error: unknown): void {
    if (this.isStorageMissingError(error)) {
      throw new BadRequestException(
        "platform config storage is not ready, run Prisma schema sync first"
      );
    }
  }

  private isStorageMissingError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    );
  }
}
