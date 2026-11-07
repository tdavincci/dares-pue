import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Admin · Dashboard')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private readonly ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Headline numbers for the admin dashboard' })
  async summary() {
    const mins = this.config.get<number>('tracking.onlineThresholdMinutes')!;
    const [devices] = await this.ds.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
              count(*) FILTER (WHERE status = 'REGISTERED')::int AS registered,
              count(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended,
              count(*) FILTER (WHERE status = 'DECOMMISSIONED')::int AS decommissioned,
              count(*) FILTER (WHERE last_seen_at >= now() - make_interval(mins => $1))::int AS online,
              count(*) FILTER (WHERE status <> 'DECOMMISSIONED' AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(mins => $1)))::int AS offline,
              count(*) FILTER (WHERE last_within_geofence = false AND status <> 'DECOMMISSIONED')::int AS outside_geofence,
              count(*) FILTER (WHERE farmer_id IS NOT NULL)::int AS assigned
         FROM devices`,
      [mins],
    );
    const [farmers] = await this.ds.query(`SELECT count(*)::int AS total FROM farmers`);
    const [payments] = await this.ds.query(
      `SELECT count(*)::int AS count, coalesce(sum(amount), 0)::float AS amount,
              count(DISTINCT device_id)::int AS paid_devices
         FROM payments WHERE status = 'COMPLETED'`,
    );
    const [pings] = await this.ds.query(
      `SELECT count(*)::int AS last24h FROM location_pings WHERE received_at >= now() - interval '24 hours'`,
    );
    const recentPayments = await this.ds.query(
      `SELECT date_trunc('day', paid_at) AS day, sum(amount)::float AS amount, count(*)::int AS count
         FROM payments WHERE status = 'COMPLETED' AND paid_at >= now() - interval '30 days'
     GROUP BY 1 ORDER BY 1`,
    );
    return {
      onlineThresholdMinutes: mins,
      devices: {
        total: devices.total,
        active: devices.active,
        registered: devices.registered,
        suspended: devices.suspended,
        decommissioned: devices.decommissioned,
        online: devices.online,
        offline: devices.offline,
        outsideGeofence: devices.outside_geofence,
        assigned: devices.assigned,
      },
      farmers: { total: farmers.total },
      payments: {
        count: payments.count,
        amount: payments.amount,
        paidDevices: payments.paid_devices,
        unpaidAssignedDevices: Math.max(0, devices.assigned - payments.paid_devices),
        last30Days: recentPayments,
      },
      locationPingsLast24h: pings.last24h,
    };
  }
}
