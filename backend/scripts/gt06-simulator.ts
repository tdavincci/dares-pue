/**
 * GT06 tracker simulator — lets you test the TCP listener without hardware.
 *
 *   npm run simulate:gt06 -- --imei 359339075123456 --lat 9.2035 --lon 12.4954 --count 10 --interval 2
 *
 * Options: --host (localhost) --port (5023) --imei --lat --lon --count (5) --interval seconds (2) --drift metres (30)
 */
import { connect } from 'net';
import { buildFrame, encodeGps, encodeLogin, extractFrames } from '../src/ingest/gt06/gt06.codec';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const host = opt('host', 'localhost');
const port = Number(opt('port', '5023'));
const imei = opt('imei', '359339075123456');
const lat0 = Number(opt('lat', '9.2035'));
const lon0 = Number(opt('lon', '12.4954'));
const count = Number(opt('count', '5'));
const interval = Number(opt('interval', '2')) * 1000;
const drift = Number(opt('drift', '30'));

let serial = 1;
const sock = connect(port, host, () => {
  console.log(`connected to ${host}:${port}, logging in as ${imei}`);
  sock.write(buildFrame(0x01, encodeLogin(imei), serial++));
  // heartbeat: terminal info, voltage level 5 (~75%), GSM 4, alarm/lang
  sock.write(buildFrame(0x13, Buffer.from([0x46, 0x05, 0x04, 0x00, 0x02]), serial++));

  let sent = 0;
  const timer = setInterval(() => {
    const dLat = ((Math.random() - 0.5) * 2 * drift) / 111_320;
    const dLon = ((Math.random() - 0.5) * 2 * drift) / (111_320 * Math.cos((lat0 * Math.PI) / 180));
    const gps = encodeGps({ date: new Date(), lat: lat0 + dLat, lon: lon0 + dLon, speed: 0, course: 0, sats: 9 });
    const lbs = Buffer.from([0x02, 0x6e, 0x0a, 0x12, 0x34, 0x00, 0xab, 0xcd]); // MCC 621 (Nigeria), MNC, LAC, CellID
    sock.write(buildFrame(0x12, Buffer.concat([gps, lbs]), serial++));
    console.log(`sent fix #${++sent}: ${(lat0 + dLat).toFixed(6)}, ${(lon0 + dLon).toFixed(6)}`);
    if (sent >= count) {
      clearInterval(timer);
      setTimeout(() => sock.end(), 500);
    }
  }, interval);
});

sock.on('data', (d) => {
  for (const f of extractFrames(d).frames) console.log(`ack proto=0x${f.protocol.toString(16)} serial=${f.serial}`);
});
sock.on('error', (e) => console.error('socket error', e.message));
sock.on('close', () => console.log('closed'));
