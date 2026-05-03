import { registerAs } from '@nestjs/config';

export default registerAs('monobank', () => ({
  baseUrl: process.env.MONOBANK_BASE_URL ?? 'https://api.monobank.ua',
  token: process.env.MONOBANK_TOKEN,
}));
