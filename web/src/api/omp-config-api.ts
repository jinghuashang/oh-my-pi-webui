import { getAuthorizationHeader } from '@/auth-token';

export interface OmpSettingItem {
  key: string;
  value: unknown;
  type: 'boolean' | 'string' | 'number' | 'enum' | 'array' | 'record';
  description: string;
  options?: string[] | null;
}

export interface OmpCategory {
  id: string;
  name: string;
  icon: string;
  items: OmpSettingItem[];
}

export interface OmpConfigResponse {
  categories: OmpCategory[];
  totalSettings: number;
}

export async function fetchOmpConfig(refresh = false): Promise<OmpConfigResponse> {
  const auth = getAuthorizationHeader();
  const res = await fetch(`/api/omp/config${refresh ? '?refresh=true' : ''}`, {
    headers: {
      Accept: 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load OMP config: ${res.statusText}`);
  }

  return res.json();
}

export async function updateOmpSetting(
  key: string,
  value: unknown,
): Promise<{ success: boolean; message?: string }> {
  const auth = getAuthorizationHeader();
  const res = await fetch('/api/omp/config', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ key, value }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update OMP setting: ${res.statusText}`);
  }

  return res.json();
}
