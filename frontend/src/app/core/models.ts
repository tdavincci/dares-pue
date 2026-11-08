export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type DeviceStatus = 'REGISTERED' | 'ACTIVE' | 'SUSPENDED' | 'DECOMMISSIONED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'POS' | 'MOBILE_MONEY' | 'CHEQUE' | 'OTHER';
export type PaymentStatus = 'COMPLETED' | 'REVERSED';

export const DEVICE_STATUSES: DeviceStatus[] = ['REGISTERED', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED'];
export type DevicePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'UNASSIGNED';
export const DEVICE_PAYMENT_STATUSES: DevicePaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'UNASSIGNED'];
export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'POS', 'MOBILE_MONEY', 'CHEQUE', 'OTHER'];

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Farmer {
  id: string;
  accountNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  state: string | null;
  lga: string | null;
  community: string | null;
  address: string | null;
  farmName: string | null;
  farmLatitude: number | null;
  farmLongitude: number | null;
  farmSizeHectares: number | null;
  primaryCrop: string | null;
  category: string;
  notes: string | null;
  deviceCount?: number;
  devices?: Device[];
  createdAt: string;
}

export interface Device {
  id: string;
  serialNumber: string;
  trackerImei: string;
  trackerModel: string;
  trackerSimNumber: string | null;
  pumpModel: string | null;
  pumpCapacity: string | null;
  price: number | null;
  currency: string;
  financingId: string | null;
  status: DeviceStatus;
  farmerId: string | null;
  farmer: Farmer | null;
  geofenceRadiusMeters: number;
  reportIntervalMinutes: number;
  installedAt: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastSeenAt: string | null;
  lastFixAt: string | null;
  lastSpeedKph: number | null;
  lastBatteryLevel: number | null;
  lastDistanceFromFarmMeters: number | null;
  lastWithinGeofence: boolean | null;
  notes: string | null;
  online: boolean;
  createdAt: string;
  /** Present on the pump list. */
  paymentStatus?: DevicePaymentStatus;
  amountPaid?: number;
  lastPaidAt?: string | null;
}

export interface MapDevice {
  id: string;
  serialNumber: string;
  trackerImei: string;
  status: DeviceStatus;
  latitude: number;
  longitude: number;
  lastSeenAt: string | null;
  batteryLevel: number | null;
  speedKph: number | null;
  online: boolean;
  withinGeofence: boolean | null;
  distanceFromFarmMeters: number | null;
  geofenceRadiusMeters: number;
  farmer: {
    id: string;
    fullName: string;
    accountNumber: string;
    phone: string;
    farmLatitude: number | null;
    farmLongitude: number | null;
  } | null;
}

export interface LocationPoint {
  id: string;
  recordedAt: string;
  receivedAt: string;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  batteryLevel: number | null;
  satellites: number | null;
  source: 'GT06' | 'HTTP' | 'OSMAND';
  distanceFromFarmMeters: number | null;
  withinGeofence: boolean | null;
}

export interface Payment {
  id: string;
  transactionId: string;
  farmerId: string;
  farmer?: Farmer;
  deviceId: string;
  device?: Device;
  amount: number;
  currency: string;
  paymentType: 'FULL_PAYMENT' | 'INSTALLMENT';
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  status: PaymentStatus;
  reversalReason: string | null;
  recordedBy?: User | null;
  notes: string | null;
  createdAt: string;
}

export interface ApiToken {
  id: string;
  tokenPrefix: string;
  kind: 'STATIC' | 'RENEWED';
  label: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiClient {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  tokens: ApiToken[];
  createdAt: string;
}

export interface UnregisteredTracker {
  imei: string;
  source: string;
  remoteAddress?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  attempts: number;
}

export interface DashboardSummary {
  onlineThresholdMinutes: number;
  devices: {
    total: number;
    active: number;
    registered: number;
    suspended: number;
    decommissioned: number;
    online: number;
    offline: number;
    outsideGeofence: number;
    assigned: number;
  };
  farmers: { total: number };
  payments: {
    count: number;
    amount: number;
    paidDevices: number;
    unpaidAssignedDevices: number;
    last30Days: { day: string; amount: number; count: number }[];
  };
  locationPingsLast24h: number;
}
