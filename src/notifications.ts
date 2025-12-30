import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_BASE = 'https://app-production-2fb0.up.railway.app';
const NOTIFICATION_ENABLED_KEY = 'push_notifications_enabled_v1';
const PUSH_TOKEN_KEY = 'push_token_v1';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Check if push notifications are supported on this device.
 */
export async function isPushNotificationsSupported(): Promise<boolean> {
  return Device.isDevice;
}

/**
 * Get the current notification permission status.
 */
export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Request permission to send push notifications.
 */
export async function requestPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/**
 * Get the Expo push token for this device.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Get project ID from Expo config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    
    if (!projectId) {
      console.error('No project ID found in Expo config');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Register the push token with our backend.
 */
async function registerTokenWithBackend(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/notifications/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('Failed to register token with backend:', error);
    return false;
  }
}

/**
 * Unregister the push token from our backend.
 */
async function unregisterTokenFromBackend(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/notifications/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to unregister token from backend:', error);
    return false;
  }
}

/**
 * Enable push notifications for this device.
 * Requests permission, gets token, and registers with backend.
 */
export async function enablePushNotifications(): Promise<{ success: boolean; error?: string }> {
  // Check device support
  if (!Device.isDevice) {
    return { success: false, error: 'Push notifications require a physical device' };
  }

  // Request permission
  const hasPermission = await requestPermission();
  if (!hasPermission) {
    return { success: false, error: 'Permission denied' };
  }

  // Get push token
  const token = await getExpoPushToken();
  if (!token) {
    return { success: false, error: 'Could not get push token' };
  }

  // Register with backend
  const registered = await registerTokenWithBackend(token);
  if (!registered) {
    return { success: false, error: 'Could not register with server' };
  }

  // Save preference and token locally
  await AsyncStorage.setItem(NOTIFICATION_ENABLED_KEY, 'true');
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

  return { success: true };
}

/**
 * Disable push notifications for this device.
 * Unregisters from backend and clears local preference.
 */
export async function disablePushNotifications(): Promise<boolean> {
  // Get stored token
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  
  if (token) {
    await unregisterTokenFromBackend(token);
  }

  // Clear local preference
  await AsyncStorage.removeItem(NOTIFICATION_ENABLED_KEY);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);

  return true;
}

/**
 * Check if push notifications are currently enabled.
 */
export async function isNotificationsEnabled(): Promise<boolean> {
  const enabled = await AsyncStorage.getItem(NOTIFICATION_ENABLED_KEY);
  return enabled === 'true';
}

/**
 * Get notification status info for display.
 */
export async function getNotificationStatus(): Promise<{
  isEnabled: boolean;
  isSupported: boolean;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
}> {
  const isSupported = await isPushNotificationsSupported();
  const isEnabled = await isNotificationsEnabled();
  const permissionStatus = await getPermissionStatus();

  return {
    isEnabled,
    isSupported,
    permissionStatus,
  };
}
