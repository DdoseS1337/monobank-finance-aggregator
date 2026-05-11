import { Global, Module } from '@nestjs/common';
import { CredentialVault } from './credential-vault.service';

@Global()
@Module({
  providers: [CredentialVault],
  exports: [CredentialVault],
})
export class CredentialsModule {}
