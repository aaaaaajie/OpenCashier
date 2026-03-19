import { ValidationPipe } from "@nestjs/common";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { RequestContextInterceptor } from "./common/interceptors/request-context.interceptor";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";
import { APP_VERSION } from "./version";

const ADMIN_SESSION_COOKIE_NAME = "opencashier_admin_session";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: false,
    rawBody: true
  });
  const configService = app.get(ConfigService);

  app.enableCors(buildCorsOptions(configService));

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new RequestContextInterceptor(),
    new ResponseEnvelopeInterceptor()
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("统一收银台 API")
    .setDescription("第一阶段 API 骨架，后续会逐步替换为真实支付逻辑。")
    .setVersion(APP_VERSION)
    .addBasicAuth(
      {
        type: "http",
        scheme: "basic"
      },
      "admin-basic"
    )
    .addCookieAuth(ADMIN_SESSION_COOKIE_NAME, {
      type: "apiKey",
      in: "cookie"
    })
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-App-Id"
      },
      "X-App-Id"
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("api/docs", app, document);

  const port = configService.get<number>("APP_PORT") ?? 3000;

  await app.listen(port);
}

void bootstrap();

function buildCorsOptions(configService: ConfigService): CorsOptions {
  const allowedOrigins = collectAllowedOrigins(configService);
  const allowAnyLocalOrigin = isLocalDeployment(configService);

  return {
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        (allowAnyLocalOrigin && isLocalOrigin(origin))
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-App-Id"]
  };
}

function collectAllowedOrigins(configService: ConfigService): Set<string> {
  const allowedOrigins = new Set<string>();

  addOrigins(allowedOrigins, configService.get<string>("WEB_BASE_URL"));
  addOrigins(allowedOrigins, configService.get<string>("CORS_ALLOWED_ORIGINS"));

  return allowedOrigins;
}

function addOrigins(target: Set<string>, value: string | undefined): void {
  if (!value) {
    return;
  }

  for (const part of value.split(",")) {
    const normalized = normalizeOrigin(part);

    if (normalized) {
      target.add(normalized);
    }
  }
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isLocalDeployment(configService: ConfigService): boolean {
  const appBaseUrl =
    configService.get<string>("APP_BASE_URL")?.trim() || "http://localhost:3000";

  try {
    return LOCAL_HOSTS.has(new URL(appBaseUrl).hostname.toLowerCase());
  } catch {
    return true;
  }
}
