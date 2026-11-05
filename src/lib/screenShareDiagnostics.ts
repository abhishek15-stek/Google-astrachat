/**
 * Browser / device / capability diagnostics for screen sharing.
 * Pure read-only — no side effects.
 */

export interface ScreenShareDiagnostics {
  browser: string;
  browserVersion: string;
  device: string;
  isAndroid: boolean;
  androidVersion: string | null;
  isMobile: boolean;
  isIOS: boolean;
  userAgent: string;
  isHttps: boolean;
  isLocalhost: boolean;
  isInIframe: boolean;
  hasMediaDevices: boolean;
  hasGetDisplayMedia: boolean;
  hasGetUserMedia: boolean;
  hasRTCPeerConnection: boolean;
  hasPermissionsAPI: boolean;
  cameraPermission: PermissionState | 'unknown';
  micPermission: PermissionState | 'unknown';
  isCapacitorNative: boolean;
  /** True if we can reasonably expect getDisplayMedia to work. */
  screenShareSupported: boolean;
  /** Human-readable reason why it's NOT supported, if not. */
  unsupportedReason: string | null;
}

function detectBrowser(ua: string): { name: string; version: string } {
  if (/Edg\//.test(ua)) return { name: 'Edge', version: ua.match(/Edg\/([\d.]+)/)?.[1] ?? '' };
  if (/OPR\//.test(ua)) return { name: 'Opera', version: ua.match(/OPR\/([\d.]+)/)?.[1] ?? '' };
  if (/Firefox\//.test(ua)) return { name: 'Firefox', version: ua.match(/Firefox\/([\d.]+)/)?.[1] ?? '' };
  if (/Chrome\//.test(ua)) return { name: 'Chrome', version: ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '' };
  if (/Safari\//.test(ua)) return { name: 'Safari', version: ua.match(/Version\/([\d.]+)/)?.[1] ?? '' };
  return { name: 'Unknown', version: '' };
}

function detectDevice(ua: string): string {
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) {
    const model = ua.match(/;\s*([^;)]+)\sBuild\//)?.[1]?.trim();
    return model ? `Android (${model})` : 'Android';
  }
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}

async function safePermission(name: PermissionName): Promise<PermissionState | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const r = await navigator.permissions.query({ name });
    return r.state;
  } catch {
    return 'unknown';
  }
}

export async function getScreenShareDiagnostics(): Promise<ScreenShareDiagnostics> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const { name: browser, version: browserVersion } = detectBrowser(ua);
  const device = detectDevice(ua);
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isMobile = isAndroid || isIOS || /Mobile/.test(ua);
  const androidVersion = isAndroid ? (ua.match(/Android\s+([\d.]+)/)?.[1] ?? null) : null;

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.|0\.0\.0\.0)/.test(window.location.hostname);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  const hasGetDisplayMedia = hasMediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  const hasRTCPeerConnection = typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
  const hasPermissionsAPI = typeof navigator !== 'undefined' && !!navigator.permissions?.query;

  const isCapacitorNative =
    typeof window !== 'undefined' &&
    // @ts-expect-error Capacitor global may be injected at runtime
    !!window.Capacitor?.isNativePlatform?.();

  let unsupportedReason: string | null = null;
  let screenShareSupported = true;

  if (!isHttps && !isLocalhost && !isCapacitorNative) {
    unsupportedReason = 'A secure context (HTTPS) is required. Open the published site over https.';
    screenShareSupported = false;
  } else if (!hasMediaDevices) {
    unsupportedReason = 'navigator.mediaDevices is unavailable in this browser.';
    screenShareSupported = false;
  } else if (!hasGetDisplayMedia && !isCapacitorNative) {
    if (isAndroid) {
      unsupportedReason =
        'Android Chrome supports tab capture from Chrome 117+. Update Chrome or install the native AstraChat app for full-screen capture.';
    } else if (isIOS) {
      unsupportedReason = 'iOS Safari does not expose getDisplayMedia. Use a desktop browser or the native app.';
    } else {
      unsupportedReason = 'getDisplayMedia is not implemented in this browser. Use Chrome, Edge, or Firefox.';
    }
    screenShareSupported = false;
  } else if (isInIframe && !isCapacitorNative) {
    unsupportedReason =
      'Running inside an iframe (Lovable preview). The browser blocks display-capture here — open the published site in a new tab.';
    screenShareSupported = false;
  }

  return {
    browser,
    browserVersion,
    device,
    isAndroid,
    androidVersion,
    isMobile,
    isIOS,
    userAgent: ua,
    isHttps,
    isLocalhost,
    isInIframe,
    hasMediaDevices,
    hasGetDisplayMedia,
    hasGetUserMedia,
    hasRTCPeerConnection,
    hasPermissionsAPI,
    cameraPermission: await safePermission('camera' as PermissionName),
    micPermission: await safePermission('microphone' as PermissionName),
    isCapacitorNative,
    screenShareSupported,
    unsupportedReason,
  };
}

/**
 * Build sensible getDisplayMedia constraints for the current device.
 * Android Chrome chokes on big resolutions and audio capture — keep it modest.
 */
export function buildDisplayMediaConstraints(opts?: { audio?: boolean }): DisplayMediaStreamOptions {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    return {
      video: { frameRate: { ideal: 24 }, width: { ideal: 1280 }, height: { ideal: 720 } },
      // Android Chrome ignores audio:true and may error if unsupported tracks requested
      audio: false,
    };
  }
  return {
    video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: opts?.audio ?? false,
  };
}

/**
 * Try the Capacitor native screen-share plugin first (if installed and on native).
 * Returns a MediaStream if successful, null if not available — caller falls back to getDisplayMedia.
 */
export async function tryNativeScreenCapture(): Promise<MediaStream | null> {
  try {
    // @ts-expect-error Capacitor injected at runtime
    if (!window.Capacitor?.isNativePlatform?.()) return null;
    // Native plugin will be installed after `npx cap add android`; gracefully no-op here.
    return null;
  } catch {
    return null;
  }
}
