'use client';

/**
 * Device Manager Component
 *
 * List, rename, and revoke trusted devices
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { apiClient } from '../../lib/api-client';
import { TrustedDevice } from '../../lib/types';

export default function DeviceManager() {
  const { accessToken } = useAuth();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Load devices
  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    if (!accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.getDevices(accessToken);

      if (result.success && result.devices) {
        setDevices(result.devices);
      } else {
        setError('Failed to load devices');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleRenameDevice = async (deviceId: string) => {
    if (!accessToken || !newName.trim()) return;

    try {
      await apiClient.updateDevice(accessToken, deviceId, {
        name: newName.trim(),
      });

      // Update local state
      setDevices(devices.map(d =>
        d.id === deviceId ? { ...d, name: newName.trim() } : d
      ));

      setEditingId(null);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename device');
    }
  };

  const handleRevokeDevice = async (deviceId: string, deviceName: string) => {
    if (!accessToken) return;

    if (!confirm(`Are you sure you want to revoke trust for "${deviceName}"? This device will need to complete 2FA on next login.`)) {
      return;
    }

    try {
      await apiClient.deleteDevice(accessToken, deviceId);

      // Remove from local state
      setDevices(devices.filter(d => d.id !== deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke device');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
  };

  const getDaysUntilExpiry = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading devices...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-600">
            No trusted devices found. Trust a device during login to see it here.
          </p>
        </div>
      ) : (
        <>
          {/* Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">
              About Trusted Devices
            </h4>
            <p className="text-sm text-blue-800">
              Trusted devices can skip 2FA verification for 30 days. You can revoke trust at any time.
            </p>
          </div>

          {/* Devices List */}
          <div className="space-y-4">
            {devices.map((device) => {
              const daysLeft = getDaysUntilExpiry(device.trusted_until);
              const isEditing = editingId === device.id;

              return (
                <div key={device.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Device Name */}
                      {isEditing ? (
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Device name"
                            className="flex-1"
                          />
                          <button
                            onClick={() => handleRenameDevice(device.id)}
                           
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setNewName('');
                            }}
                           
                           
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {device.name}
                          </h3>
                          {device.is_current && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Current Device
                            </span>
                          )}
                        </div>
                      )}

                      {/* Device Info */}
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          <span className="font-medium">Last used:</span>{' '}
                          {formatDate(device.last_used_at)}
                        </p>
                        <p>
                          <span className="font-medium">Trusted since:</span>{' '}
                          {formatDate(device.trusted_at)}
                        </p>
                        <p>
                          <span className="font-medium">Trust expires:</span>{' '}
                          {formatDate(device.trusted_until)}
                          <span
                            className={`ml-2 ${
                              daysLeft <= 7 ? 'text-red-600' : 'text-gray-600'
                            }`}
                          >
                            ({daysLeft} days remaining)
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingId(device.id);
                            setNewName(device.name);
                          }}
                         
                         
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleRevokeDevice(device.id, device.name)}
                         
                         
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          Revoke Trust
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
