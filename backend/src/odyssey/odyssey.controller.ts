import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiClientsService, ValidatedClient } from '../api-clients/api-clients.service';
import { ApiTokenGuard } from '../api-clients/api-token.guard';
import {
  OdysseyMeterResponse,
  OdysseyPaymentResponse,
  TokenRenewalRequest,
  TokenRenewalResponse,
} from './dto/odyssey.dto';
import { OdysseyService, RangeQuery } from './odyssey.service';

/** Odyssey sends upper-case filter names; a query value repeated in the URL arrives as an array (use the first). */
function rangeQuery(q: Record<string, string | string[] | undefined>): RangeQuery {
  const v = (k: string) => {
    const x = q[k];
    return Array.isArray(x) ? x[0] : x;
  };
  return {
    from: v('FROM'),
    to: v('TO'),
    id: v('ID'),
    offset: v('offset'),
    pageLimit: v('pageLimit'),
    financingId: v('FINANCING_ID'),
    siteId: v('SITE_ID'),
    country: v('COUNTRY'),
  };
}

export const ODYSSEY_BEARER = 'Bearer Authentication';

const FROM_Q = { name: 'FROM', required: true, type: String, example: '2026-01-01T00:00:00Z' };
const TO_Q = { name: 'TO', required: true, type: String, example: '2026-01-02T00:00:00Z' };

/** Optional filters from the Odyssey Standard API docs, shared by both datasets. */
function OdysseyFilters() {
  return applyDecorators(
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      example: 0,
      description: 'Records to skip (default 0). Odyssey sends offset=0 first, then the next offset.',
    }),
    ApiQuery({
      name: 'pageLimit',
      required: false,
      type: Number,
      example: 20,
      description: 'Max records in the page. Without it, the whole window is returned (up to the server maximum).',
    }),
    ApiQuery({
      name: 'FINANCING_ID',
      required: false,
      type: String,
      description: 'Only records for pumps with this financing identifier',
    }),
    ApiQuery({
      name: 'SITE_ID',
      required: false,
      type: String,
      description: 'Accepted for compatibility; DARES PUE has no site grouping, so it does not filter',
    }),
    ApiQuery({
      name: 'COUNTRY',
      required: false,
      type: String,
      example: 'NG',
      description: 'All pumps are in Nigeria: NG/NGA/Nigeria returns everything, any other country returns none',
    }),
    // Listed like Odyssey's reference spec. The token always travels in this header, never in the URL.
    // Swagger UI does not send a header parameter named Authorization: use the Authorize button to try calls.
    ApiHeader({
      name: 'Authorization',
      required: true,
      description: 'Bearer authorization token (set it with the Authorize button to try requests here)',
      example: 'Bearer dpue_at_xxxxxxxxxxxxxxxxxxxxxxxx',
    }),
  );
}

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
  @OdysseyFilters()
  @ApiQuery({
    name: 'ID',
    required: false,
    type: String,
    example: 'PUMP-SPX-000123',
    description: 'Specific meter (pump serial or tracker IMEI). If not provided, returns data from all pumps.',
  })
  @ApiQuery({ ...TO_Q, description: 'End date/time in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)' })
  @ApiQuery({ ...FROM_Q, description: 'Start date/time in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)' })
  @ApiOkResponse({ type: OdysseyMeterResponse })
  @ApiBadRequestResponse({ description: 'Invalid parameters provided' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authorization token' })
  readings(@Query() q: Record<string, string>) {
    return this.odyssey.readings(rangeQuery(q));
  }

  @Get('electricity/payments')
  @UseGuards(ApiTokenGuard)
  @ApiTags('Payments')
  @ApiBearerAuth(ODYSSEY_BEARER)
  @ApiOperation({
    operationId: 'getPayments',
    summary: 'Get payment history',
    description:
      'Electricity Payments contract. Returns every pump payment event registered in the window (`FROM`/`TO` required, ' +
      'ISO 8601 UTC). Each pump is paid for in full (`FULL_PAYMENT`). If a payment is later reversed, the original ' +
      'payment keeps appearing in its own window and a separate `REVERSAL` event (transactionId `<original>-REV`, ' +
      'negative amount) appears at the reversal time, so historical windows never change. Optional `ID` filters by ' +
      'transaction ID, pump serial (meterId/serialNumber) or tracker IMEI. Pagination is optional (`offset`, `pageLimit`). ' +
      "The path keeps Odyssey's standard name (`electricity/payments`).",
  })
  @OdysseyFilters()
  @ApiQuery({ ...TO_Q, description: 'End timestamp in ISO 8601 UTC format' })
  @ApiQuery({ ...FROM_Q, description: 'Start timestamp in ISO 8601 UTC format' })
  @ApiQuery({
    name: 'ID',
    required: false,
    type: String,
    example: 'DPUE-20260215-7KQ2M9XA',
    description: 'Transaction or meter identifier',
  })
  @ApiOkResponse({ type: OdysseyPaymentResponse })
  @ApiBadRequestResponse({ description: 'Invalid parameters provided' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authorization token' })
  payments(@Query() q: Record<string, string>) {
    return this.odyssey.payments(rangeQuery(q));
  }

  @Post('token-renewal')
  @HttpCode(200)
  @ApiTags('Token Renewal')
  @ApiOperation({
    operationId: 'renew',
    summary: 'Exchange a refresh token for a new access token',
    description:
      "Odyssey's optional automatic token renewal contract. In Odyssey, enable automatic renewal and save this URL as " +
      '`tokenRenewalEndpoint` and the refresh token issued in the DARES PUE portal (API access → Issue refresh token) as ' +
      '`tokenRenewalSecret`. Odyssey sends `POST` with `Content-Type: application/json` and `{ "refreshToken": "<secret>" }`; ' +
      'the response is HTTP 200 with exactly `accessToken` (non-empty string) and `expiresIn` (positive integer, seconds). ' +
      'The refresh token is not rotated by this call, so the saved secret keeps working. The access token works as ' +
      '`Authorization: Bearer <accessToken>` on both data endpoints until it expires.',
  })
  @ApiOkResponse({ type: TokenRenewalResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async renew(
    @Body() body: TokenRenewalRequest,
    @Req() req: { apiClient?: Partial<ValidatedClient> },
  ): Promise<TokenRenewalResponse> {
    const res = await this.clients.renew(body.refreshToken);
    if (!res) throw new UnauthorizedException('Invalid refresh token');
    req.apiClient = res.client; // identifies the caller in the access history
    return res.response;
  }
}
