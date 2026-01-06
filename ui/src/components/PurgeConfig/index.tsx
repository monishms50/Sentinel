import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  AlertTriangle,
  Zap,
  Clock,
  Power,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useConfig } from '../../hooks';
import type { PurgeSpeed } from '../../types';

// ============================================================================
// CONSTANTS
// ============================================================================

interface SpeedConfig {
  label: string;
  threshold: number;
  gracePeriod: number;
  description: string;
  color: string;
  icon: typeof Shield;
}

const SPEED_CONFIGS: Record<PurgeSpeed, SpeedConfig> = {
  off: {
    label: 'Off',
    threshold: 0,
    gracePeriod: 0,
    description: 'Auto-purge disabled. Manual purge only.',
    color: '#4a5568',
    icon: Power,
  },
  conservative: {
    label: 'Conservative',
    threshold: 30,
    gracePeriod: 300,
    description: 'Purge pods with score < 30 after 5 minute grace period.',
    color: '#00ff9f',
    icon: Shield,
  },
  moderate: {
    label: 'Moderate',
    threshold: 40,
    gracePeriod: 60,
    description: 'Purge pods with score < 40 after 1 minute grace period.',
    color: '#fbbf24',
    icon: AlertTriangle,
  },
  aggressive: {
    label: 'Aggressive',
    threshold: 50,
    gracePeriod: 0,
    description: 'Immediately purge pods with score < 50.',
    color: '#ff6b6b',
    icon: Zap,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export const PurgeConfig: React.FC = () => {
  const { config, loading, error, updateConfig } = useConfig();
  
  // Local state for editing
  const [localEnabled, setLocalEnabled] = useState(true);
  const [localSpeed, setLocalSpeed] = useState<PurgeSpeed>('moderate');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync with fetched config
  useEffect(() => {
    if (config) {
      setLocalEnabled(config.autoPurgeEnabled);
      setLocalSpeed(config.purgeSpeed);
    }
  }, [config]);

  // Check for unsaved changes
  const hasChanges = config && (
    config.autoPurgeEnabled !== localEnabled ||
    config.purgeSpeed !== localSpeed
  );

  // Reset to saved values
  const handleReset = () => {
    if (config) {
      setLocalEnabled(config.autoPurgeEnabled);
      setLocalSpeed(config.purgeSpeed);
    }
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    
    try {
      await updateConfig({
        autoPurgeEnabled: localEnabled,
        purgeSpeed: localSpeed,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const selectedConfig = SPEED_CONFIGS[localSpeed];

  // Loading state
  if (loading) {
    return (
      <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sentinel-border rounded w-1/3" />
          <div className="h-32 bg-sentinel-border rounded" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-sentinel-danger" />
        <p className="text-sentinel-muted">Failed to load configuration</p>
      </div>
    );
  }

  return (
    <div className="bg-sentinel-surface border border-sentinel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border bg-sentinel-bg/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-sentinel-accent" />
            <h2 className="font-semibold text-sentinel-text">Purge Configuration</h2>
          </div>
          {hasChanges && (
            <span className="text-xs text-sentinel-warning">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Auto-purge toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-sentinel-text">Auto-Purge</h3>
            <p className="text-xs text-sentinel-muted mt-0.5">
              Automatically terminate compromised pods
            </p>
          </div>
          <button
            onClick={() => setLocalEnabled(!localEnabled)}
            className={`
              relative w-14 h-7 rounded-full transition-colors duration-200
              ${localEnabled ? 'bg-sentinel-accent' : 'bg-sentinel-border'}
            `}
          >
            <span
              className={`
                absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm
                transition-all duration-200
                ${localEnabled ? 'left-8' : 'left-1'}
              `}
            />
          </button>
        </div>

        {/* Speed selection */}
        {localEnabled && (
          <div>
            <h3 className="text-sm font-medium text-sentinel-text mb-3">Purge Speed</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {(Object.entries(SPEED_CONFIGS) as [PurgeSpeed, SpeedConfig][])
                .filter(([key]) => key !== 'off')
                .map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isSelected = localSpeed === key;
                  
                  return (
                    <button
                      key={key}
                      onClick={() => setLocalSpeed(key)}
                      className={`
                        p-3 rounded-lg border-2 transition-all text-center
                        ${isSelected
                          ? 'border-sentinel-accent bg-sentinel-accent/10'
                          : 'border-sentinel-border hover:border-sentinel-muted bg-sentinel-bg/50'
                        }
                      `}
                    >
                      <Icon
                        className="w-6 h-6 mx-auto mb-2"
                        style={{ color: isSelected ? cfg.color : '#4a5568' }}
                      />
                      <span
                        className="text-sm font-medium block"
                        style={{ color: isSelected ? cfg.color : '#b3b1ad' }}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-sentinel-muted block mt-1">
                        &lt; {cfg.threshold} score
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Current settings display */}
        <div
          className="p-4 rounded-lg border-2"
          style={{
            backgroundColor: `${selectedConfig.color}08`,
            borderColor: `${selectedConfig.color}30`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${selectedConfig.color}20` }}
            >
              <selectedConfig.icon
                className="w-5 h-5"
                style={{ color: selectedConfig.color }}
              />
            </div>
            <div className="flex-1">
              <h4
                className="font-medium"
                style={{ color: selectedConfig.color }}
              >
                {localEnabled ? `${selectedConfig.label} Mode` : 'Auto-Purge Disabled'}
              </h4>
              <p className="text-xs text-sentinel-muted mt-1">
                {localEnabled ? selectedConfig.description : 'Pods must be purged manually.'}
              </p>
            </div>
          </div>

          {localEnabled && localSpeed !== 'off' && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-xs text-sentinel-muted">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  Threshold:{' '}
                  <span className="text-sentinel-text font-medium">
                    score &lt; {selectedConfig.threshold}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-sentinel-muted">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Grace period:{' '}
                  <span className="text-sentinel-text font-medium">
                    {selectedConfig.gracePeriod === 0
                      ? 'Immediate'
                      : `${selectedConfig.gracePeriod}s`}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Disabled info */}
        {!localEnabled && (
          <div className="p-4 rounded-lg bg-sentinel-border/20 border border-sentinel-border text-center">
            <Power className="w-8 h-8 mx-auto mb-2 text-sentinel-muted" />
            <p className="text-sm text-sentinel-muted">
              Auto-purge is disabled. Use the Pod Manager to manually purge compromised pods.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-sentinel-border text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border/30 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg
              font-medium text-sm transition-all
              ${saving || !hasChanges
                ? 'bg-sentinel-border text-sentinel-muted cursor-not-allowed'
                : saved
                  ? 'bg-sentinel-accent/20 text-sentinel-accent'
                  : 'bg-sentinel-accent text-sentinel-bg hover:bg-sentinel-accent/90'
              }
            `}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurgeConfig;
