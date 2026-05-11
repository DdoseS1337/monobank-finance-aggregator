import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly anonClient: SupabaseClient;
  private readonly adminClient: SupabaseClient;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = config.getOrThrow<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
    this.adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  client(): SupabaseClient {
    return this.anonClient;
  }

  admin(): SupabaseClient {
    return this.adminClient;
  }
}
