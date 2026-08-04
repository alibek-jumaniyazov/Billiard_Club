import { Global, Module } from '@nestjs/common';
import { LicenseService } from './license.service';

/**
 * Global litsenziya moduli — AuthService ham, PublicController ham uni
 * import qilmasdan inject qila oladi (AuditModule bilan bir xil naqsh).
 */
@Global()
@Module({
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
