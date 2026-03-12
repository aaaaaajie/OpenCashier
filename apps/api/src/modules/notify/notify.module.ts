import { Module } from "@nestjs/common";
import { MerchantNotifyDispatcherService } from "./merchant-notify-dispatcher.service";
import { NotifyController } from "./notify.controller";
import { NotifyService } from "./notify.service";

@Module({
  controllers: [NotifyController],
  providers: [NotifyService, MerchantNotifyDispatcherService],
  exports: [MerchantNotifyDispatcherService]
})
export class NotifyModule {}
