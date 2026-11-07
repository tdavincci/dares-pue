import { Body, Controller, Get, HttpCode, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiClientsService } from '../api-clients/api-clients.service';
import { ApiTokenGuard } from '../api-clients/api-token.guard';
import {
  OdysseyMeterResponse,
  OdysseyPaymentResponse,
  TokenRenewalRequest,
  TokenRenewalResponse,
} from './dto/odyssey.dto';
import { OdysseyService } from './odyssey.service';

export const ODYSSEY_BEARER = 'Bearer Authentication';

const FROM_Q = { name: 'FROM', required: true, type: String, example: '2026-01-01T00:00:00Z' };
const TO_Q = { name: 'TO', required: true, type: String, example: '2026-01-01T23:59:59Z' };

@SkipThrottle()
@Controller('odyssey/standard')
export class OdysseyController {
  constructor(
    private readonly odyssey: OdysseyService,
    private readonly clients: ApiClientsService,
  ) {}

  @Get('meter/readings')
  @UseGuards(ApiTokenGuard)
  @ApiTags('Meter Readings')
  @ApiBearerAuth(ODYSSEY_BEARER)
  @ApiOperation({
    operationId: 'getMeters',
    summary: 'Get meter readings (pump GPS positions)',
    description:
      'Returns GPS position fixes reported by the trackers fitted to DARES PUE water pumps for the requested window. ' +
      '`FROM` and `TO` are required and must be ISO 8601 (UTC). Each pump is exposed as a "meter" whose `meterId` is the pump ' +
      'serial number; `latitude`/`longitude` are strings with 6 decimal places. Energy fields (`energyConsumptionKwh`, ' +
      '`energyReadingKwh`, `rate`, `rateCurrency`) do not apply to pumps and are omitted. Positions are down-sampled to one ' +
      'per pump per `timeIntervalMinutes`. Pagination is optional (`offset`, `pageLimit`); without `pageLimit` all readings ' +
      'in the window are returned (up to the server maximum).',
  })
  @ApiQuery({ ...FROM_Q, description: 'Start date/time in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)' })
  @ApiQuery({ ...TO_Q, description: 'End date/time in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)' })
  @ApiQuery({
    name: 'ID',
    required: false,
    type: String,
    example: 'PUMP-SPX-000123',
    description: 'Specific meter (pump serial or tracker IMEI). If not provided, returns data from all pumps.',
  })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0, description: 'Records to skip (default 0)' })
  @ApiQuery({ name: 'pageLimit', required: false, type: Number, example: 20, description: 'Max records in the page' })
  @ApiOkResponse({ type: OdysseyMeterResponse })
  @ApiBadRequestResponse({ description: 'Invalid parameters provided' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authorization token' })
  readings(
    @Query('FROM') from?: string,
    @Query('TO') to?: string,
    @Query('ID') id?: string,
    @Query('offset') offset?: string,
    @Query('pageLimit') pageLimit?: string,
  ) {
    return this.odyssey.readings({ from, to, id, offset, pageLimit });
  }

  @Get('electricity/payments')
  @UseGuards(ApiTokenGuard)
  @ApiTags('Payments')
  @ApiBearerAuth(ODYSSEY_BEARER)
  @ApiOperation({
    operationId: 'getPayments',
    summary: 'Get payment history',
    description:
      'Retrieves completed pump payment records for the requested window. `FROM` and `TO` are required (ISO 8601 UTC). ' +
      "Optional `ID` filters by transaction ID, pump serial (meterId) or tracker IMEI. The path keeps Odyssey's " +
      'standard name (`electricity/payments`) for compatibility.',
  })
  @ApiQuery({
    name: 'ID',
    required: false,
    type: String,
    example: 'DPUE-20260215-7KQ2M9XA',
    description: 'Transaction or meter identifier',
  })
  @ApiQuery({ ...FROM_Q, description: 'Start timestamp in ISO 8601 UTC format' })
  @ApiQuery({ ...TO_Q, description: 'End timestamp in ISO 8601 UTC format' })
  @ApiOkResponse({ type: OdysseyPaymentResponse })
  @ApiBadRequestResponse({ description: 'Invalid parameters provided' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authorization token' })
  payments(@Query('FROM') from?: string, @Query('TO') to?: string, @Query('ID') id?: string) {
    return this.odyssey.payments({ from, to, id });
  }

  @Post('token-renewal')
  @HttpCode(200)
  @ApiTags('Token Renewal')
  @ApiOperation({
    operationId: 'renew',
    summary: 'Exchange a refresh token for a new access token',
    description:
      'Optional flow. An admin issues a refresh token to the integrator; the integrator calls this endpoint to obtain ' +
      'short-lived access tokens (`expiresIn` seconds) for the Bearer header.',
  })
  @ApiOkResponse({ type: TokenRenewalResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async renew(@Body() body: TokenRenewalRequest): Promise<TokenRenewalResponse> {
    const res = await this.clients.renew(body.refreshToken);
    if (!res) throw new UnauthorizedException('Invalid refresh token');
    return res;
  }
}
