import type { ServerConfig } from '@/types';
import { apiGet } from './client';

export async function getServerConfig(): Promise<ServerConfig> {
  return apiGet<ServerConfig>('/server-config');
}
