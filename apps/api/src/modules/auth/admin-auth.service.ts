import {
  Injectable,
  OnModuleInit,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const ADMIN_SESSION_COOKIE = "opencashier_admin_session";
const DEFAULT_SESSION_TTL_HOURS = 12;

type AdminAuthSource = "SESSION" | "BASIC";

interface AdminSessionPayload {
  username: string;
  expireAt: number;
}

export interface AdminPrincipal {
  username: string;
  authSource: AdminAuthSource;
}

@Injectable()
export class AdminAuthService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      throw new Error(
        "ADMIN_USERNAME and ADMIN_PASSWORD are required to enable admin authentication"
      );
    }
  }

  getSessionCookieName(): string {
    return ADMIN_SESSION_COOKIE;
  }

  isEnabled(): boolean {
    return Boolean(
      this.configService.get<string>("ADMIN_USERNAME")?.trim() &&
        this.configService.get<string>("ADMIN_PASSWORD")?.trim()
    );
  }

  resolveRequestPrincipal(request: Request): AdminPrincipal | null {
    const basicPrincipal = this.resolveBasicPrincipal(request);

    if (basicPrincipal) {
      return basicPrincipal;
    }

    return this.resolveSessionPrincipal(request);
  }

  assertAuthenticated(request: Request): AdminPrincipal {
    const principal = this.resolveRequestPrincipal(request);

    if (!principal) {
      throw new UnauthorizedException({
        code: "ADMIN_AUTH_REQUIRED",
        message: "Admin authentication required"
      });
    }

    return principal;
  }

  getSessionStatus(request: Request) {
    const principal = this.resolveRequestPrincipal(request);

    return {
      enabled: this.isEnabled(),
      authenticated: Boolean(principal),
      username: principal?.username,
      authSource: principal?.authSource ?? null
    };
  }

  login(response: Response, username: string, password: string) {
    const principal = this.verifyCredentials(username, password);

    if (!principal) {
      throw new UnauthorizedException({
        code: "ADMIN_AUTH_INVALID",
        message: "Invalid admin username or password"
      });
    }

    response.cookie(this.getSessionCookieName(), this.signSession(principal.username), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.shouldUseSecureCookie(),
      maxAge: this.getSessionTtlMs(),
      path: "/"
    });

    return {
      enabled: this.isEnabled(),
      authenticated: true,
      username: principal.username,
      authSource: "SESSION" as const
    };
  }

  logout(response: Response) {
    response.clearCookie(this.getSessionCookieName(), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.shouldUseSecureCookie(),
      path: "/"
    });

    return {
      enabled: this.isEnabled(),
      authenticated: false,
      username: null,
      authSource: null
    };
  }

  private verifyCredentials(
    username: string,
    password: string
  ): AdminPrincipal | null {
    const expectedUsername = this.configService.get<string>("ADMIN_USERNAME")?.trim();
    const expectedPassword = this.configService.get<string>("ADMIN_PASSWORD")?.trim();

    if (!expectedUsername || !expectedPassword) {
      return null;
    }

    if (
      !this.safeEqual(username.trim(), expectedUsername) ||
      !this.safeEqual(password, expectedPassword)
    ) {
      return null;
    }

    return {
      username: expectedUsername,
      authSource: "SESSION"
    };
  }

  private resolveBasicPrincipal(request: Request): AdminPrincipal | null {
    const authorization = request.header("authorization");

    if (!authorization?.startsWith("Basic ")) {
      return null;
    }

    const decoded = this.decodeBasicAuthorization(authorization.slice("Basic ".length));

    if (!decoded) {
      return null;
    }

    const principal = this.verifyCredentials(decoded.username, decoded.password);

    if (!principal) {
      return null;
    }

    return {
      username: principal.username,
      authSource: "BASIC"
    };
  }

  private resolveSessionPrincipal(request: Request): AdminPrincipal | null {
    const cookieValue = this.parseCookies(request.header("cookie"))[
      this.getSessionCookieName()
    ];

    if (!cookieValue) {
      return null;
    }

    const payload = this.verifySession(cookieValue);

    if (!payload) {
      return null;
    }

    return {
      username: payload.username,
      authSource: "SESSION"
    };
  }

  private signSession(username: string): string {
    const payload: AdminSessionPayload = {
      username,
      expireAt: Date.now() + this.getSessionTtlMs()
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.getSessionSecret())
      .update(encodedPayload)
      .digest("base64url");

    return `${encodedPayload}.${signature}`;
  }

  private verifySession(token: string): AdminSessionPayload | null {
    const [encodedPayload, signature] = token.split(".");

    if (!encodedPayload || !signature) {
      return null;
    }

    const expected = createHmac("sha256", this.getSessionSecret())
      .update(encodedPayload)
      .digest("base64url");

    if (!this.safeEqual(signature, expected)) {
      return null;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8")
      ) as Partial<AdminSessionPayload>;

      if (
        typeof payload.username !== "string" ||
        typeof payload.expireAt !== "number" ||
        payload.expireAt <= Date.now()
      ) {
        return null;
      }

      return {
        username: payload.username,
        expireAt: payload.expireAt
      };
    } catch {
      return null;
    }
  }

  private parseCookies(headerValue: string | undefined): Record<string, string> {
    if (!headerValue) {
      return {};
    }

    return headerValue.split(";").reduce<Record<string, string>>((result, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex <= 0) {
        return result;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      if (!key) {
        return result;
      }

      result[key] = decodeURIComponent(value);
      return result;
    }, {});
  }

  private decodeBasicAuthorization(
    encodedValue: string
  ): { username: string; password: string } | null {
    try {
      const decoded = Buffer.from(encodedValue, "base64").toString("utf8");
      const separatorIndex = decoded.indexOf(":");

      if (separatorIndex <= 0) {
        return null;
      }

      return {
        username: decoded.slice(0, separatorIndex),
        password: decoded.slice(separatorIndex + 1)
      };
    } catch {
      return null;
    }
  }

  private safeEqual(left: string, right: string): boolean {
    const leftHash = createHash("sha256").update(left).digest();
    const rightHash = createHash("sha256").update(right).digest();

    try {
      return timingSafeEqual(leftHash, rightHash);
    } catch {
      return false;
    }
  }

  private getSessionSecret(): string {
    return (
      this.configService.get<string>("APP_SECRET")?.trim() ||
      "local-dev-admin-session-secret"
    );
  }

  private getSessionTtlMs(): number {
    const configuredHours = Number(
      this.configService.get<string>("ADMIN_SESSION_TTL_HOURS")
    );
    const hours =
      Number.isFinite(configuredHours) && configuredHours > 0
        ? configuredHours
        : DEFAULT_SESSION_TTL_HOURS;

    return hours * 60 * 60 * 1000;
  }

  private shouldUseSecureCookie(): boolean {
    const appBaseUrl = this.configService.get<string>("APP_BASE_URL")?.trim();
    return appBaseUrl?.startsWith("https://") ?? false;
  }
}
