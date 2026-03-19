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

const GLOBAL_SCOPE_KEY = "__global__";

interface CachedPlatformConfigGroup {
  id: string;
  key: PlatformConfigGroupKey;
  appId?: string;
  value: PlatformConfigGroupValue;
  createdAt: Date;
  updatedAt: Date;
}

interface UpsertPlatformConfigInput {
  key: string;
  value: Record<string, unknown>;
  appId?: string;
}

interface AdminPlatformConfigStageRecord {
  id: string;
  value: AdminPlatformConfigValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPlatformConfigRecord {
  key: string;
  appId?: string;
  active?: AdminPlatformConfigStageRecord;
  draft?: AdminPlatformConfigStageRecord;
}

export interface ResolvedPlatformConfigGroupRecord {
  key: PlatformConfigGroupKey;
  appId?: string;
  value: Record<string, string>;
}

@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  private readonly activeConfigCache = new Map<string, CachedPlatformConfigGroup>();
  private readonly draftConfigCache = new Map<string, CachedPlatformConfigGroup>();
  private readonly previewContext = new AsyncLocalStorage<
    Map<string, PlatformConfigGroupValue>
  >();
  private readonly scopeContext = new AsyncLocalStorage<string | undefined>();

  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reloadCache();
  }

  get(key: PlatformConfigKey, options?: { appId?: string }): string | undefined {
    const groupKey = getPlatformConfigGroupKeyByFieldKey(key);

    if (!groupKey) {
      return undefined;
    }

    const appId = this.resolveScopeAppId(options?.appId);
    const previewGroup =
      this.previewContext.getStore()?.get(this.toCacheKey(groupKey, appId)) ??
      (appId
        ? this.previewContext.getStore()?.get(this.toCacheKey(groupKey))
        : undefined);

    if (previewGroup) {
      return previewGroup[key];
    }

    const cached =
      this.readCachedGroup(this.activeConfigCache, groupKey, appId) ??
      (appId ? this.readCachedGroup(this.activeConfigCache, groupKey) : undefined);
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

  getCurrentScopeAppId(): string | undefined {
    return this.resolveScopeAppId();
  }

  runWithScope<T>(appId: string | undefined, callback: () => T): T {
    return this.scopeContext.run(this.normalizeValue(appId), callback);
  }

  listConfigs(appId?: string): AdminPlatformConfigRecord[] {
    const normalizedAppId = this.normalizeValue(appId);
    const keys = new Set<PlatformConfigGroupKey>([
      ...this.listScopeGroups(this.activeConfigCache, normalizedAppId).map(
        (item) => item.key
      ),
      ...this.listScopeGroups(this.draftConfigCache, normalizedAppId).map(
        (item) => item.key
      )
    ]);

    return Array.from(keys)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => {
        const active = this.readCachedGroup(this.activeConfigCache, key, normalizedAppId);
        const draft = this.readCachedGroup(this.draftConfigCache, key, normalizedAppId);

        return {
          key,
          ...(normalizedAppId ? { appId: normalizedAppId } : {}),
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

  listResolvedActiveConfigGroups(
    groupKey: PlatformConfigGroupKey,
    options?: { preferAppId?: string }
  ): ResolvedPlatformConfigGroupRecord[] {
    const preferredAppId = this.normalizeValue(options?.preferAppId);

    return Array.from(this.activeConfigCache.values())
      .filter((item) => item.key === groupKey)
      .sort((left, right) =>
        this.compareScopePriority(left.appId, right.appId, preferredAppId)
      )
      .map((item) => ({
        key: item.key,
        ...(item.appId ? { appId: item.appId } : {}),
        value: this.toEditableValue(groupKey, item.value)
      }));
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

    const appId = this.normalizeValue(input.appId);
    const nextValue = this.buildPreviewGroupValue(input.key, input.value, appId);
    const storageKey = this.toStorageKey(input.key, "DRAFT", appId);

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
            value: persistedValue,
            ...this.toRelationUpdateData(appId)
          },
          create: {
            key: storageKey,
            value: persistedValue,
            ...this.toRelationCreateData(appId)
          }
        });
      }
    } catch (error) {
      this.rethrowIfStorageMissing(error);
      throw error;
    }

    await this.reloadCache();
    return this.listConfigs(appId);
  }

  async clearConfig(
    key: string,
    options?: { appId?: string }
  ): Promise<AdminPlatformConfigRecord[]> {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    const appId = this.normalizeValue(options?.appId);

    try {
      await this.prismaService.platformConfig.deleteMany({
        where: {
          key: {
            in: [
              this.toStorageKey(key, "ACTIVE", appId),
              this.toStorageKey(key, "DRAFT", appId)
            ]
          }
        }
      });
    } catch (error) {
      this.rethrowIfStorageMissing(error);
      throw error;
    }

    await this.reloadCache();
    return this.listConfigs(appId);
  }

  async activateConfig(
    key: string,
    options?: { appId?: string }
  ): Promise<AdminPlatformConfigRecord[]> {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    const appId = this.normalizeValue(options?.appId);
    const draft = this.readCachedGroup(this.draftConfigCache, key, appId);

    if (!draft) {
      throw new BadRequestException(`${key} has no draft config to activate`);
    }

    try {
      await this.prismaService.platformConfig.upsert({
        where: { key: this.toStorageKey(key, "ACTIVE", appId) },
        update: {
          value: draft.value as Prisma.InputJsonObject,
          ...this.toRelationUpdateData(appId)
        },
        create: {
          key: this.toStorageKey(key, "ACTIVE", appId),
          value: draft.value as Prisma.InputJsonObject,
          ...this.toRelationCreateData(appId)
        }
      });

      await this.prismaService.platformConfig.deleteMany({
        where: {
          key: this.toStorageKey(key, "DRAFT", appId)
        }
      });
    } catch (error) {
      this.rethrowIfStorageMissing(error);
      throw error;
    }

    await this.reloadCache();
    return this.listConfigs(appId);
  }

  async runWithPreview<T>(
    key: string,
    patchValue: Record<string, unknown>,
    callback: () => Promise<T>,
    options?: { appId?: string }
  ): Promise<T> {
    if (!isPlatformConfigGroupKey(key)) {
      throw new BadRequestException(
        `unsupported platform config group key: ${key}`
      );
    }

    const appId = this.resolveScopeAppId(options?.appId);
    const previewValue = this.buildPreviewGroupValue(key, patchValue, appId);
    const currentStore = this.previewContext.getStore();
    const nextStore = new Map(currentStore ?? []);

    nextStore.set(this.toCacheKey(key, appId), previewValue);

    return this.previewContext.run(nextStore, callback);
  }

  private async reloadCache(): Promise<void> {
    try {
      const records = await this.prismaService.platformConfig.findMany({
        select: {
          id: true,
          key: true,
          appId: true,
          value: true,
          createdAt: true,
          updatedAt: true
        }
      });
      this.activeConfigCache.clear();
      this.draftConfigCache.clear();

      records.forEach((record) => {
        const parsedKey = this.parseStorageKey(record.key, record.appId);

        if (!parsedKey) {
          return;
        }

        const targetCache =
          parsedKey.stage === "DRAFT"
            ? this.draftConfigCache
            : this.activeConfigCache;

        targetCache.set(this.toCacheKey(parsedKey.key, parsedKey.appId), {
          id: record.id,
          key: parsedKey.key,
          appId: parsedKey.appId,
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
    patchValue: Record<string, unknown>,
    appId?: string
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
      this.getEditableGroupValue(key, appId),
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
    groupKey: PlatformConfigGroupKey,
    appId?: string
  ): PlatformConfigGroupValue {
    const cached =
      this.readCachedGroup(this.draftConfigCache, groupKey, appId) ??
      this.readCachedGroup(this.activeConfigCache, groupKey, appId);

    if (!cached) {
      return {};
    }

    return this.toEditableValue(groupKey, cached.value);
  }

  private toEditableValue(
    groupKey: PlatformConfigGroupKey,
    value: PlatformConfigGroupValue
  ): PlatformConfigGroupValue {
    const groupDefinition = getPlatformConfigGroupDefinition(groupKey);

    if (!groupDefinition) {
      return {};
    }

    return groupDefinition.items.reduce<PlatformConfigGroupValue>((result, item) => {
      const rawValue = value[item.key];

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
    stage: PlatformConfigStage,
    appId?: string
  ): string {
    const suffix = stage === "ACTIVE" ? key : `${key}__draft`;

    return appId ? `app:${appId}:${suffix}` : suffix;
  }

  private parseStorageKey(
    key: string,
    storedAppId?: string | null
  ):
    | {
        key: PlatformConfigGroupKey;
        stage: PlatformConfigStage;
        appId?: string;
      }
    | undefined {
    const appId = this.normalizeValue(storedAppId ?? undefined);
    const scoped = appId
      ? this.parseScopedStorageKey(key, appId)
      : this.parseInlineScopedStorageKey(key);

    if (scoped) {
      return scoped;
    }

    return this.parseGlobalStorageKey(key);
  }

  private parseScopedStorageKey(
    storageKey: string,
    appId: string
  ):
    | {
        key: PlatformConfigGroupKey;
        stage: PlatformConfigStage;
        appId: string;
      }
    | undefined {
    const prefix = `app:${appId}:`;

    if (!storageKey.startsWith(prefix)) {
      return undefined;
    }

    const parsedSuffix = this.parseStorageSuffix(storageKey.slice(prefix.length));

    if (!parsedSuffix) {
      return undefined;
    }

    return {
      ...parsedSuffix,
      appId
    };
  }

  private parseInlineScopedStorageKey(
    storageKey: string
  ):
    | {
        key: PlatformConfigGroupKey;
        stage: PlatformConfigStage;
        appId: string;
      }
    | undefined {
    const match = /^app:([^:]+):(.+)$/.exec(storageKey);

    if (!match) {
      return undefined;
    }

    const [, appId, suffix] = match;

    if (!suffix) {
      return undefined;
    }

    const normalizedAppId = this.normalizeValue(appId);
    const parsedSuffix = this.parseStorageSuffix(suffix);

    if (!normalizedAppId || !parsedSuffix) {
      return undefined;
    }

    return {
      ...parsedSuffix,
      appId: normalizedAppId
    };
  }

  private parseGlobalStorageKey(
    storageKey: string
  ): { key: PlatformConfigGroupKey; stage: PlatformConfigStage } | undefined {
    return this.parseStorageSuffix(storageKey);
  }

  private parseStorageSuffix(
    storageKey: string
  ): { key: PlatformConfigGroupKey; stage: PlatformConfigStage } | undefined {
    if (isPlatformConfigGroupKey(storageKey)) {
      return {
        key: storageKey,
        stage: "ACTIVE"
      };
    }

    const draftKey = storageKey.replace(/__draft$/, "");

    if (!isPlatformConfigGroupKey(draftKey) || draftKey === storageKey) {
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

  private resolveScopeAppId(explicitAppId?: string): string | undefined {
    return this.normalizeValue(explicitAppId) ?? this.scopeContext.getStore();
  }

  private readCachedGroup(
    cache: Map<string, CachedPlatformConfigGroup>,
    groupKey: PlatformConfigGroupKey,
    appId?: string
  ): CachedPlatformConfigGroup | undefined {
    return cache.get(this.toCacheKey(groupKey, appId));
  }

  private listScopeGroups(
    cache: Map<string, CachedPlatformConfigGroup>,
    appId?: string
  ): CachedPlatformConfigGroup[] {
    const normalizedAppId = this.normalizeValue(appId);

    return Array.from(cache.values()).filter((item) =>
      this.sameScope(item.appId, normalizedAppId)
    );
  }

  private toCacheKey(groupKey: PlatformConfigGroupKey, appId?: string): string {
    return `${appId ?? GLOBAL_SCOPE_KEY}:${groupKey}`;
  }

  private sameScope(left: string | undefined, right: string | undefined): boolean {
    return (left ?? undefined) === (right ?? undefined);
  }

  private compareScopePriority(
    left: string | undefined,
    right: string | undefined,
    preferredAppId?: string
  ): number {
    const leftRank = this.toScopeRank(left, preferredAppId);
    const rightRank = this.toScopeRank(right, preferredAppId);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (left ?? "").localeCompare(right ?? "");
  }

  private toScopeRank(appId: string | undefined, preferredAppId?: string): number {
    if (appId && preferredAppId && appId === preferredAppId) {
      return 0;
    }

    if (!appId) {
      return preferredAppId ? 1 : 0;
    }

    return 2;
  }

  private toRelationCreateData(appId?: string) {
    return appId
      ? {
          app: {
            connect: {
              appId
            }
          }
        }
      : {};
  }

  private toRelationUpdateData(appId?: string) {
    return appId
      ? {
          app: {
            connect: {
              appId
            }
          }
        }
      : {
          app: {
            disconnect: true
          }
        };
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
