import type {
  APIResponse,
  Pod,
  PodDetail,
  LeaderboardEntry,
  ClusterStats,
  PurgeConfig,
  DriftEvent,
  Baseline,
  ScoreHistoryPoint,
} from '../types';

// ============================================================================
// API CLIENT
// ============================================================================

const API_BASE = import.meta.env.VITE_API_URL || '';

class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // --------------------------------------------------------------------------
  // Generic request method
  // --------------------------------------------------------------------------
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }

    const data: APIResponse<T> = await response.json();

    if (!data.success) {
      throw new Error(data.error || data.message || 'Unknown API error');
    }

    return data.data as T;
  }

  // --------------------------------------------------------------------------
  // Pod endpoints
  // --------------------------------------------------------------------------
  async getPods(namespace?: string): Promise<Pod[]> {
    const params = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
    return this.request<Pod[]>(`/api/pods${params}`);
  }

  async getPod(uid: string): Promise<PodDetail> {
    return this.request<PodDetail>(`/api/pods/${encodeURIComponent(uid)}`);
  }

  async deletePod(uid: string): Promise<void> {
    await this.request<void>(`/api/pods/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
    });
  }

  async getPodBaseline(uid: string): Promise<Baseline> {
    return this.request<Baseline>(`/api/pods/${encodeURIComponent(uid)}/baseline`);
  }

  async getPodEvents(uid: string, limit = 50): Promise<DriftEvent[]> {
    return this.request<DriftEvent[]>(
      `/api/pods/${encodeURIComponent(uid)}/events?limit=${limit}`
    );
  }

  async getPodHistory(uid: string, limit = 100): Promise<ScoreHistoryPoint[]> {
    return this.request<ScoreHistoryPoint[]>(
      `/api/pods/${encodeURIComponent(uid)}/history?limit=${limit}`
    );
  }

  // --------------------------------------------------------------------------
  // Leaderboard
  // --------------------------------------------------------------------------
  async getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    return this.request<LeaderboardEntry[]>(`/api/leaderboard?limit=${limit}`);
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------
  async getStats(): Promise<ClusterStats> {
    return this.request<ClusterStats>('/api/stats');
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------
  async getRecentEvents(limit = 100): Promise<DriftEvent[]> {
    return this.request<DriftEvent[]>(`/api/events?limit=${limit}`);
  }

  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------
  async getConfig(): Promise<PurgeConfig> {
    return this.request<PurgeConfig>('/api/config');
  }

  async updateConfig(config: Partial<PurgeConfig>): Promise<PurgeConfig> {
    return this.request<PurgeConfig>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  // --------------------------------------------------------------------------
  // Health check
  // --------------------------------------------------------------------------
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const api = new APIClient(API_BASE);
export default api;
