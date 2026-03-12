import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { RequestContextInterceptor } from "./common/interceptors/request-context.interceptor";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

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
    .setVersion("0.1.0")
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

  const configService = app.get(ConfigService);
  const port = configService.get<number>("APP_PORT") ?? 3000;

  await app.listen(port);
}

void bootstrap();
